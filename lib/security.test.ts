import test from "node:test";
import assert from "node:assert/strict";
import {
  DUMMY_HASH,
  hashPassword,
  newToken,
  normalizeEmail,
  passwordError,
  sha256Hex,
  signSession,
  verifyPassword,
  verifySessionToken,
} from "./security";

test("normalizeEmail: ตัดช่องว่าง ตัวพิมพ์เล็ก และปฏิเสธรูปแบบผิด", () => {
  assert.equal(normalizeEmail("  Foo@Example.COM "), "foo@example.com");
  assert.equal(normalizeEmail("ไม่ใช่อีเมล"), null);
  assert.equal(normalizeEmail("a@b"), null);
  assert.equal(normalizeEmail(123), null);
});

test("passwordError: ขั้นต่ำ 8 ตัว", () => {
  assert.ok(passwordError("short"));
  assert.equal(passwordError("12345678"), null);
  assert.ok(passwordError("x".repeat(201)));
});

test("hashPassword/verifyPassword: รหัสถูกผ่าน รหัสผิดไม่ผ่าน และ hash ไม่ซ้ำ", async () => {
  const h1 = await hashPassword("correct horse");
  const h2 = await hashPassword("correct horse");
  assert.notEqual(h1, h2);
  assert.equal(await verifyPassword("correct horse", h1), true);
  assert.equal(await verifyPassword("wrong", h1), false);
  assert.equal(await verifyPassword("x", "garbage"), false);
  assert.equal(await verifyPassword("x", DUMMY_HASH), false);
});

test("session: เซ็น/ตรวจได้ แก้ข้อมูลหรือหมดอายุไม่ผ่าน", () => {
  const secret = "test-secret-1234567890";
  const now = 1_000_000;
  const t = signSession({ u: "abc", v: 2, x: now + 1000 }, secret);
  assert.deepEqual(verifySessionToken(t, secret, now), { u: "abc", v: 2, x: now + 1000 });
  assert.equal(verifySessionToken(t, "other-secret-xxxxxxxx", now), null);
  assert.equal(verifySessionToken(t, secret, now + 1000), null);

  const [body, sig] = t.split(".");
  const forged = Buffer.from(JSON.stringify({ u: "admin", v: 2, x: now + 1000 })).toString("base64url");
  assert.equal(verifySessionToken(`${forged}.${sig}`, secret, now), null);
  assert.equal(verifySessionToken(body, secret, now), null);
  assert.equal(verifySessionToken("", secret, now), null);
});

test("newToken/sha256Hex", () => {
  assert.notEqual(newToken(), newToken());
  assert.equal(sha256Hex("a").length, 64);
});

import { parseReferrerCode } from "./referral";

test("parseReferrerCode: รหัสล้วน ลิงก์เต็ม และค่าที่ไม่ใช่รหัส", () => {
  assert.equal(parseReferrerCode("ab12cd34"), "AB12CD34");
  assert.equal(parseReferrerCode("  https://example.com/login?ref=ab12cd34 "), "AB12CD34");
  assert.equal(parseReferrerCode("https://example.com/login?x=1&ref=ZZ99AA11"), "ZZ99AA11");
  assert.equal(parseReferrerCode(""), null);
  assert.equal(parseReferrerCode("สมชาย ใจดี"), null);
  assert.equal(parseReferrerCode("ab"), null);
  assert.equal(parseReferrerCode(42), null);
});
