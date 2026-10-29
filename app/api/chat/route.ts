import { getSessionUser } from "@/lib/auth";
import { bumpUsage, getProfile, isActive } from "@/lib/store";
import {
  DAILY_MESSAGE_LIMIT,
  MAX_HISTORY,
  MAX_MESSAGE_CHARS,
  MAX_TOKENS,
  MODEL,
  OLLAMA_BASE_URL,
  OLLAMA_TIMEOUT_MS,
  SYSTEM_PROMPT,
} from "@/lib/config";

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

  if (!(await bumpUsage(user.uid, DAILY_MESSAGE_LIMIT))) {
    return json("ใช้ครบโควตาวันนี้แล้ว ลองใหม่พรุ่งนี้", 429);
  }

  // เรียก Ollama จากฝั่งเซิร์ฟเวอร์เท่านั้น (Ollama ไม่มีระบบล็อกอินในตัว ห้ามเปิดให้เบราว์เซอร์หรืออินเทอร์เน็ตเรียกตรง)
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), OLLAMA_TIMEOUT_MS);
  req.signal.addEventListener("abort", () => abort.abort());

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  // ถ้ามี reverse proxy คั่นหน้า Ollama ไว้และตั้งรหัสผ่านไว้ ใส่ที่นี่ (ไม่บังคับ)
  if (process.env.OLLAMA_API_KEY) {
    headers.Authorization = `Bearer ${process.env.OLLAMA_API_KEY}`;
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: "POST",
      headers,
      signal: abort.signal,
      body: JSON.stringify({
        model: MODEL,
        stream: true,
        messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
        options: { num_predict: MAX_TOKENS },
      }),
    });
  } catch (err) {
    clearTimeout(timer);
    console.error("Ollama connection error:", err);
    return json("เชื่อมต่อโมเดลไม่ได้ในขณะนี้ ลองใหม่อีกครั้ง", 503);
  }

  if (!upstream.ok || !upstream.body) {
    clearTimeout(timer);
    console.error("Ollama error:", upstream.status, await upstream.text().catch(() => ""));
    return json("โมเดลตอบกลับผิดพลาด ลองใหม่อีกครั้ง", 502);
  }

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  // Ollama ส่งกลับเป็น JSON ทีละบรรทัด (NDJSON) แปลงเป็นข้อความล้วนให้ตรงกับที่ Chat.tsx อ่าน
  const readable = new ReadableStream({
    async start(controller) {
      let buf = "";
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let i: number;
          while ((i = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, i).trim();
            buf = buf.slice(i + 1);
            if (!line) continue;
            const chunk = JSON.parse(line) as {
              message?: { content?: string };
              error?: string;
            };
            if (chunk.error) throw new Error(chunk.error);
            if (chunk.message?.content) {
              controller.enqueue(encoder.encode(chunk.message.content));
            }
          }
        }
        controller.close();
      } catch (err) {
        console.error("Ollama stream error:", err);
        controller.error(err);
      } finally {
        clearTimeout(timer);
      }
    },
    cancel() {
      abort.abort();
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
