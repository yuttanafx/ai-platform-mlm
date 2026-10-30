import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ConfigError,
  chatStream,
  loadProviders,
  textFromOllamaLine,
  textFromSseLine,
} from "./llm";

test("ค่าเริ่มต้น: ใช้ Ollama บนเครื่อง ไม่มีตัวสำรอง", () => {
  const { primary, fallback } = loadProviders({});
  assert.equal(primary.kind, "ollama");
  assert.equal(primary.baseUrl, "http://localhost:11434");
  assert.equal(primary.model, "gemma3:4b");
  assert.equal(fallback, null);
});

test("ตั้งตัวหลัก openai + ตัวสำรอง ollama", () => {
  const { primary, fallback } = loadProviders({
    LLM_PROVIDER: "openai",
    LLM_FALLBACK_PROVIDER: "ollama",
    OPENAI_BASE_URL: "https://api.deepseek.com/v1/",
    OPENAI_MODEL: "m",
    OPENAI_API_KEY: "k",
    OLLAMA_BASE_URL: "https://ollama.com/",
    OLLAMA_API_KEY: "ok",
  });
  assert.equal(primary.baseUrl, "https://api.deepseek.com/v1");
  assert.equal(fallback?.baseUrl, "https://ollama.com");
  assert.equal(fallback?.apiKey, "ok");
});

test("ตั้งค่าผิด: ขาดคีย์/โมเดล, ชื่อผิด, ตัวสำรองซ้ำตัวหลัก", () => {
  assert.throws(() => loadProviders({ LLM_PROVIDER: "openai", OPENAI_MODEL: "m" }), ConfigError);
  assert.throws(() => loadProviders({ LLM_PROVIDER: "openai", OPENAI_API_KEY: "k" }), ConfigError);
  assert.throws(() => loadProviders({ LLM_PROVIDER: "claude" }), ConfigError);
  assert.throws(() => loadProviders({ LLM_PROVIDER: "ollama", LLM_FALLBACK_PROVIDER: "ollama" }), ConfigError);
  assert.throws(
    () => loadProviders({ LLM_PROVIDER: "openai", OPENAI_MODEL: "m", OPENAI_API_KEY: "k", OPENAI_MAX_TOKENS_PARAM: "x" }),
    ConfigError
  );
});

test("แปลงบรรทัด Ollama", () => {
  assert.equal(textFromOllamaLine('{"message":{"content":"สวัสดี"},"done":false}'), "สวัสดี");
  assert.equal(textFromOllamaLine('{"done":true}'), "");
  assert.throws(() => textFromOllamaLine('{"error":"model not found"}'), /model not found/);
});

test("แปลงบรรทัด SSE แบบ OpenAI", () => {
  assert.equal(textFromSseLine('data: {"choices":[{"delta":{"content":"hi"}}]}'), "hi");
  assert.equal(textFromSseLine('data: {"choices":[{"delta":{}}]}'), "");
  assert.equal(textFromSseLine('data: {"choices":[{"delta":{"content":null}}]}'), "");
  assert.equal(textFromSseLine("data: [DONE]"), null);
  assert.equal(textFromSseLine(": keep-alive"), "");
  assert.throws(() => textFromSseLine('data: {"error":{"message":"rate limited"}}'), /rate limited/);
});

async function readAll(s: ReadableStream<Uint8Array>) {
  const r = s.getReader();
  const d = new TextDecoder();
  let out = "";
  for (;;) {
    const { done, value } = await r.read();
    if (done) return out;
    out += d.decode(value);
  }
}

const sse = (...parts: string[]) =>
  new Response(
    parts.map((t) => `data: ${JSON.stringify({ choices: [{ delta: { content: t } }] })}\n\n`).join("") +
      "data: [DONE]\n\n"
  );

test("สตรีมจริง: ตัวหลัก openai ตอบได้ ไม่ไปเรียกตัวสำรอง", async () => {
  const calls: string[] = [];
  const orig = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push(url);
    const body = JSON.parse(String(init.body));
    assert.equal(body.max_completion_tokens, 100); // ตั้ง OPENAI_MAX_TOKENS_PARAM ไว้
    assert.equal(new Headers(init.headers).get("authorization"), "Bearer k");
    return sse("ส", "วัสดี");
  }) as typeof fetch;
  try {
    const stream = await chatStream({
      messages: [{ role: "user", content: "hi" }],
      maxTokens: 100,
      signal: new AbortController().signal,
      headerTimeoutMs: 1000,
      totalTimeoutMs: 5000,
      env: {
        LLM_PROVIDER: "openai", LLM_FALLBACK_PROVIDER: "ollama",
        OPENAI_MODEL: "m", OPENAI_API_KEY: "k", OPENAI_MAX_TOKENS_PARAM: "max_completion_tokens",
      },
    });
    assert.equal(await readAll(stream), "สวัสดี");
    assert.deepEqual(calls, ["https://api.openai.com/v1/chat/completions"]);
  } finally {
    globalThis.fetch = orig;
  }
});

test("ตัวหลักล่ม (HTTP 503) -> สลับไปตัวสำรอง Ollama", async () => {
  const calls: string[] = [];
  const orig = globalThis.fetch;
  const origErr = console.error;
  console.error = () => {};
  globalThis.fetch = (async (url: string) => {
    calls.push(url);
    if (url.includes("/chat/completions")) return new Response("down", { status: 503 });
    return new Response('{"message":{"content":"สำรอง"}}\n{"done":true}\n');
  }) as typeof fetch;
  try {
    const stream = await chatStream({
      messages: [{ role: "user", content: "hi" }],
      maxTokens: 10,
      signal: new AbortController().signal,
      headerTimeoutMs: 1000,
      totalTimeoutMs: 5000,
      env: { LLM_PROVIDER: "openai", LLM_FALLBACK_PROVIDER: "ollama", OPENAI_MODEL: "m", OPENAI_API_KEY: "k" },
    });
    assert.equal(await readAll(stream), "สำรอง");
    assert.equal(calls.length, 2);
  } finally {
    globalThis.fetch = orig;
    console.error = origErr;
  }
});

test("ทุกตัวล่ม -> โยน error", async () => {
  const orig = globalThis.fetch;
  const origErr = console.error;
  console.error = () => {};
  globalThis.fetch = (async () => new Response("x", { status: 500 })) as typeof fetch;
  try {
    await assert.rejects(
      chatStream({
        messages: [{ role: "user", content: "hi" }],
        maxTokens: 10,
        signal: new AbortController().signal,
        headerTimeoutMs: 1000,
        totalTimeoutMs: 5000,
        env: {},
      })
    );
  } finally {
    globalThis.fetch = orig;
    console.error = origErr;
  }
});
