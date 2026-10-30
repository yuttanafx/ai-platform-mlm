import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeHealth } from "./health";
import { probeProvider, type Provider } from "./llm";

test("ปกติ: db และตัวหลักผ่าน", () => {
  const r = summarizeHealth({ db: true, primary: true, fallback: null });
  assert.deepEqual(r, { status: "ok", http: 200, checks: { db: "ok", model: "ok" } });
});

test("ตัวหลักล่มแต่ตัวสำรองพร้อม = degraded (ยัง 200)", () => {
  const r = summarizeHealth({ db: true, primary: false, fallback: true });
  assert.equal(r.status, "degraded");
  assert.equal(r.http, 200);
  assert.equal(r.checks.model, "fallback");
});

test("โมเดลล่มทั้งหมด หรือไม่มีตัวสำรอง = down (503)", () => {
  assert.equal(summarizeHealth({ db: true, primary: false, fallback: false }).http, 503);
  assert.equal(summarizeHealth({ db: true, primary: false, fallback: null }).status, "down");
});

test("ฐานข้อมูลล่ม = down แม้โมเดลปกติ", () => {
  const r = summarizeHealth({ db: false, primary: true, fallback: true });
  assert.equal(r.status, "down");
  assert.equal(r.http, 503);
  assert.equal(r.checks.db, "down");
});

const ollama: Provider = { kind: "ollama", baseUrl: "http://x", model: "m", apiKey: null, maxTokensParam: "max_tokens" };
const openai: Provider = { kind: "openai", baseUrl: "http://y/v1", model: "m", apiKey: "k", maxTokensParam: "max_tokens" };
const fake = (status: number, urls: string[] = []) =>
  (async (url: string) => {
    urls.push(url);
    return new Response("{}", { status });
  }) as unknown as typeof fetch;

test("probeProvider: Ollama เรียก /api/tags ตอบ 200 = พร้อม", async () => {
  const urls: string[] = [];
  assert.equal(await probeProvider(ollama, 1000, fake(200, urls)), true);
  assert.deepEqual(urls, ["http://x/api/tags"]);
  assert.equal(await probeProvider(ollama, 1000, fake(500)), false);
});

test("probeProvider: OpenAI-compatible เรียก /models, 404 ยังนับว่าเข้าถึงได้ แต่ 401/5xx ไม่", async () => {
  const urls: string[] = [];
  assert.equal(await probeProvider(openai, 1000, fake(200, urls)), true);
  assert.deepEqual(urls, ["http://y/v1/models"]);
  assert.equal(await probeProvider(openai, 1000, fake(404)), true);
  assert.equal(await probeProvider(openai, 1000, fake(401)), false);
  assert.equal(await probeProvider(openai, 1000, fake(503)), false);
});

test("probeProvider: เชื่อมต่อไม่ได้ = ไม่พร้อม (ไม่โยน error)", async () => {
  const boom = (async () => {
    throw new Error("ECONNREFUSED");
  }) as unknown as typeof fetch;
  assert.equal(await probeProvider(ollama, 1000, boom), false);
});
