// ชั้นเชื่อมต่อโมเดล รองรับ 2 รูปแบบ และตั้งตัวสำรองได้
//   ollama  = รูปแบบของ Ollama (/api/chat) ใช้ได้ทั้ง Ollama บนเครื่อง/VPS และ Ollama Cloud (https://ollama.com)
//   openai  = รูปแบบ OpenAI-compatible (/chat/completions) ใช้ได้กับ OpenAI, DeepSeek, Together,
//             Groq ฯลฯ และ Ollama Cloud ที่ https://ollama.com/v1 เปลี่ยนเจ้าแค่เปลี่ยน OPENAI_BASE_URL
// ไฟล์นี้ไม่ import อะไรจากโปรเจกต์ เพื่อให้ทดสอบแยกได้ ค่าอ่านจากตัวแปรสภาพแวดล้อมฝั่งเซิร์ฟเวอร์เท่านั้น

export type Msg = { role: "system" | "user" | "assistant"; content: string };
export type ProviderKind = "ollama" | "openai";

export type Provider = {
  kind: ProviderKind;
  baseUrl: string;
  model: string;
  apiKey: string | null;
  maxTokensParam: "max_tokens" | "max_completion_tokens"; // ใช้กับ openai เท่านั้น
};

export class ConfigError extends Error {}

type Env = Record<string, string | undefined>;

const trimSlash = (s: string) => s.replace(/\/+$/, "");

function build(kind: ProviderKind, env: Env): Provider {
  if (kind === "ollama") {
    return {
      kind,
      baseUrl: trimSlash(env.OLLAMA_BASE_URL || "http://localhost:11434"),
      model: env.OLLAMA_MODEL || "gemma3:4b",
      apiKey: env.OLLAMA_API_KEY || null,
      maxTokensParam: "max_tokens",
    };
  }
  const model = env.OPENAI_MODEL;
  if (!model) throw new ConfigError("ยังไม่ได้ตั้งค่า OPENAI_MODEL");
  if (!env.OPENAI_API_KEY) throw new ConfigError("ยังไม่ได้ตั้งค่า OPENAI_API_KEY");
  const param = env.OPENAI_MAX_TOKENS_PARAM || "max_tokens";
  if (param !== "max_tokens" && param !== "max_completion_tokens") {
    throw new ConfigError("OPENAI_MAX_TOKENS_PARAM ต้องเป็น max_tokens หรือ max_completion_tokens");
  }
  return {
    kind,
    baseUrl: trimSlash(env.OPENAI_BASE_URL || "https://api.openai.com/v1"),
    model,
    apiKey: env.OPENAI_API_KEY,
    maxTokensParam: param,
  };
}

function kindOf(v: string | undefined, name: string): ProviderKind | null {
  if (!v) return null;
  if (v === "ollama" || v === "openai") return v;
  throw new ConfigError(`${name} ต้องเป็น ollama หรือ openai`);
}

// LLM_PROVIDER = ตัวหลัก (ค่าเริ่มต้น ollama)  LLM_FALLBACK_PROVIDER = ตัวสำรอง (ไม่บังคับ)
export function loadProviders(env: Env = process.env): { primary: Provider; fallback: Provider | null } {
  const primaryKind = kindOf(env.LLM_PROVIDER, "LLM_PROVIDER") ?? "ollama";
  const fallbackKind = kindOf(env.LLM_FALLBACK_PROVIDER, "LLM_FALLBACK_PROVIDER");
  if (fallbackKind === primaryKind) {
    throw new ConfigError("LLM_FALLBACK_PROVIDER ต้องต่างจาก LLM_PROVIDER");
  }
  return {
    primary: build(primaryKind, env),
    fallback: fallbackKind ? build(fallbackKind, env) : null,
  };
}

// ---------- แปลงข้อมูลที่สตรีมกลับมา เป็นข้อความล้วน ----------

// Ollama ส่ง JSON ทีละบรรทัด
export function textFromOllamaLine(line: string): string {
  const j = JSON.parse(line) as { message?: { content?: string }; error?: string };
  if (j.error) throw new Error(j.error);
  return j.message?.content ?? "";
}

// OpenAI-compatible ส่ง Server-Sent Events: บรรทัด "data: {...}" และปิดด้วย "data: [DONE]"
// คืน null เมื่อจบสตรีม, "" เมื่อเป็นบรรทัดที่ไม่มีข้อความ
export function textFromSseLine(line: string): string | null {
  if (!line.startsWith("data:")) return "";
  const data = line.slice(5).trim();
  if (data === "[DONE]") return null;
  if (!data) return "";
  const j = JSON.parse(data) as {
    choices?: { delta?: { content?: string | null } }[];
    error?: { message?: string } | string;
  };
  if (j.error) throw new Error(typeof j.error === "string" ? j.error : (j.error.message ?? "provider error"));
  return j.choices?.[0]?.delta?.content ?? "";
}

// ---------- เรียกโมเดล ----------

function requestFor(p: Provider, messages: Msg[], maxTokens: number) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (p.apiKey) headers.Authorization = `Bearer ${p.apiKey}`;
  if (p.kind === "ollama") {
    return {
      url: `${p.baseUrl}/api/chat`,
      headers,
      body: { model: p.model, stream: true, messages, options: { num_predict: maxTokens } },
    };
  }
  return {
    url: `${p.baseUrl}/chat/completions`,
    headers,
    body: { model: p.model, stream: true, messages, [p.maxTokensParam]: maxTokens },
  };
}

async function attempt(
  p: Provider,
  messages: Msg[],
  maxTokens: number,
  outer: AbortSignal,
  headerMs: number,
  totalMs: number
): Promise<ReadableStream<Uint8Array>> {
  const ac = new AbortController();
  const onOuter = () => ac.abort();
  outer.addEventListener("abort", onOuter, { once: true });
  // รอให้โมเดลเริ่มตอบไม่เกิน headerMs หลังจากนั้นจำกัดเวลาทั้งสตรีมที่ totalMs รวม
  let timer = setTimeout(() => ac.abort(), headerMs);
  const done = () => {
    clearTimeout(timer);
    outer.removeEventListener("abort", onOuter);
  };

  let res: Response;
  try {
    const r = requestFor(p, messages, maxTokens);
    res = await fetch(r.url, {
      method: "POST",
      headers: r.headers,
      body: JSON.stringify(r.body),
      signal: ac.signal,
    });
    if (!res.ok || !res.body) {
      const detail = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} ${detail.slice(0, 200)}`);
    }
  } catch (e) {
    done();
    throw e;
  }

  clearTimeout(timer);
  timer = setTimeout(() => ac.abort(), totalMs);

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  const enc = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let buf = "";
      try {
        outer_loop: for (;;) {
          const { done: end, value } = await reader.read();
          if (end) break;
          buf += dec.decode(value, { stream: true });
          let i: number;
          while ((i = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, i).trim();
            buf = buf.slice(i + 1);
            if (!line) continue;
            const text = p.kind === "ollama" ? textFromOllamaLine(line) : textFromSseLine(line);
            if (text === null) break outer_loop;
            if (text) controller.enqueue(enc.encode(text));
          }
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      } finally {
        done();
      }
    },
    cancel() {
      ac.abort();
      done();
    },
  });
}

// ลองตัวหลักก่อน ถ้าเชื่อมต่อไม่ได้/หมดเวลา/ตอบ error ตั้งแต่ยังไม่เริ่มสตรีม ให้ลองตัวสำรอง
// (ถ้าสตรีมไปแล้วค่อยพัง จะไม่สลับ เพราะข้อความครึ่งหนึ่งส่งถึงผู้ใช้ไปแล้ว)
export async function chatStream(opts: {
  messages: Msg[];
  maxTokens: number;
  signal: AbortSignal;
  headerTimeoutMs: number; // รอให้เริ่มตอบ (เฉพาะตัวหลักที่มีตัวสำรอง)
  totalTimeoutMs: number;
  env?: Env;
}): Promise<ReadableStream<Uint8Array>> {
  const { primary, fallback } = loadProviders(opts.env);
  const chain = fallback ? [primary, fallback] : [primary];
  let lastErr: unknown;
  for (let i = 0; i < chain.length; i++) {
    const p = chain[i];
    const last = i === chain.length - 1;
    try {
      return await attempt(
        p,
        opts.messages,
        opts.maxTokens,
        opts.signal,
        last ? opts.totalTimeoutMs : Math.min(opts.headerTimeoutMs, opts.totalTimeoutMs),
        opts.totalTimeoutMs
      );
    } catch (e) {
      lastErr = e;
      if (opts.signal.aborted) break; // ผู้ใช้ปิดหน้าเอง ไม่ต้องลองต่อ
      // ไม่ log คีย์ log แค่ประเภท/โมเดล/ข้อความผิดพลาด
      console.error(`LLM provider failed (${p.kind}, ${p.model}):`, e instanceof Error ? e.message : e);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("LLM unavailable");
}

// ตรวจเบา ๆ ว่าผู้ให้บริการยังเข้าถึงได้ (ไม่ส่งข้อความจริง ไม่เสียโทเค็น)
//   ollama: GET /api/tags   openai: GET /models (บางเจ้าไม่มีเส้นทางนี้ จึงนับว่าเข้าถึงได้ถ้าไม่ใช่ 5xx/401/403)
export async function probeProvider(
  p: Provider,
  timeoutMs = 4000,
  fetchImpl: typeof fetch = fetch
): Promise<boolean> {
  const headers: Record<string, string> = {};
  if (p.apiKey) headers.Authorization = `Bearer ${p.apiKey}`;
  const url = p.kind === "ollama" ? `${p.baseUrl}/api/tags` : `${p.baseUrl}/models`;
  try {
    const res = await fetchImpl(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
    await res.body?.cancel().catch(() => {});
    if (p.kind === "ollama") return res.ok;
    return res.status < 500 && res.status !== 401 && res.status !== 403;
  } catch {
    return false;
  }
}
