import { getSessionUser } from "@/lib/auth";
import { bumpUsage, getProfile, isActive } from "@/lib/store";
import {
  DAILY_MESSAGE_LIMIT,
  MAX_HISTORY,
  MAX_MESSAGE_CHARS,
  LLM_FIRST_BYTE_MS,
  LLM_TIMEOUT_MS,
  MAX_TOKENS,
  SYSTEM_PROMPT,
} from "@/lib/config";
import { ConfigError, chatStream } from "@/lib/llm";
import { withRelease } from "@/lib/limiter";
import { acquireChatSlot } from "@/lib/slots";

export const runtime = "nodejs";
// เพดานเวลาของฟังก์ชันบน Vercel (วินาที) ปรับตามแผนที่ใช้
export const maxDuration = 60;

type ChatMessage = { role: "user" | "assistant"; content: string };

function json(error: string, status: number) {
  return Response.json({ error }, { status });
}

function parseMessages(body: unknown): ChatMessage[] | null {
  if (!body || typeof body !== "object") return null;
  const raw = (body as { messages?: unknown }).messages;
  if (!Array.isArray(raw)) return null;

  const messages: ChatMessage[] = [];
  for (const m of raw) {
    if (!m || typeof m !== "object") return null;
    const { role, content } = m as { role?: unknown; content?: unknown };
    if (role !== "user" && role !== "assistant") return null;
    if (typeof content !== "string") return null;
    const text = content.trim().slice(0, MAX_MESSAGE_CHARS);
    if (text) messages.push({ role, content: text });
  }

  const recent = messages.slice(-MAX_HISTORY);
  // API ต้องเริ่มด้วยข้อความของผู้ใช้
  while (recent.length && recent[0].role !== "user") recent.shift();
  return recent.length && recent[recent.length - 1].role === "user"
    ? recent
    : null;
}

export async function POST(req: Request) {
  // 1) ต้องล็อกอิน 2) แพ็กเกจต้องยังไม่หมดอายุ 3) ไม่เกินโควตาต่อวัน
  const user = await getSessionUser();
  if (!user) return json("กรุณาเข้าสู่ระบบ", 401);

  if (!isActive(await getProfile(user.uid))) {
    return json("แพ็กเกจหมดอายุ กรุณาต่ออายุที่หน้าแพ็กเกจ", 402);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json("รูปแบบคำขอไม่ถูกต้อง", 400);
  }

  const messages = parseMessages(body);
  if (!messages) return json("ข้อความไม่ถูกต้องหรือว่างเปล่า", 400);

  // จำกัดจำนวนคำตอบที่สร้างพร้อมกัน ตรวจก่อนหักโควตา คิวเต็มแล้วสมาชิกจะไม่เสียข้อความที่ไม่ได้ใช้
  const release = await acquireChatSlot();
  if (!release) {
    return Response.json(
      { error: "ตอนนี้มีคนใช้งานเยอะ กรุณาลองใหม่อีกครั้งในอีกสักครู่" },
      { status: 503, headers: { "Retry-After": "5" } }
    );
  }

  let handedOver = false; // true = ช่องถูกส่งต่อให้สตรีม (ปล่อยเมื่อสตรีมจบ)
  try {
    if (!(await bumpUsage(user.uid, DAILY_MESSAGE_LIMIT))) {
      return json("ใช้ครบโควตาวันนี้แล้ว ลองใหม่พรุ่งนี้", 429);
    }

    // เรียกโมเดลจากฝั่งเซิร์ฟเวอร์เท่านั้น (คีย์และที่อยู่โมเดลห้ามออกไปถึงเบราว์เซอร์)
    // ตั้งตัวหลัก/ตัวสำรองด้วย LLM_PROVIDER / LLM_FALLBACK_PROVIDER ดู lib/llm.ts
    let stream: ReadableStream<Uint8Array>;
    try {
      stream = await chatStream({
        messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
        maxTokens: MAX_TOKENS,
        signal: req.signal,
        headerTimeoutMs: LLM_FIRST_BYTE_MS,
        totalTimeoutMs: LLM_TIMEOUT_MS,
      });
    } catch (err) {
      if (err instanceof ConfigError) {
        console.error("LLM config error:", err.message);
        return json("ระบบโมเดลตั้งค่าไม่ครบ กรุณาแจ้งผู้ดูแล", 500);
      }
      return json("เชื่อมต่อโมเดลไม่ได้ในขณะนี้ ลองใหม่อีกครั้ง", 503);
    }

    handedOver = true;
    return new Response(withRelease(stream, release), {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } finally {
    if (!handedOver) release();
  }
}
