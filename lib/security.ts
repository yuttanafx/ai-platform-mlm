import {
  createHash,
  createHmac,
  randomBytes,
  scrypt as scryptCb,
  timingSafeEqual,
} from "node:crypto";

// ฟังก์ชันล้วน ๆ ไม่ต่อฐานข้อมูล ทดสอบได้ด้วย `npm test`

// ---------- อีเมล / รหัสผ่าน ----------

export function normalizeEmail(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const e = input.trim().toLowerCase();
  if (e.length < 5 || e.length > 254) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return null;
  return e;
}

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 200;

export function passwordError(pw: unknown): string | null {
  if (typeof pw !== "string") return "กรุณากรอกรหัสผ่าน";
  if (pw.length < PASSWORD_MIN) return `รหัสผ่านสั้นเกินไป (อย่างน้อย ${PASSWORD_MIN} ตัวอักษร)`;
  if (pw.length > PASSWORD_MAX) return "รหัสผ่านยาวเกินไป";
  return null;
}

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEYLEN = 64;

function scrypt(pw: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(pw, salt, KEYLEN, { N: n, r, p }, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

// รูปแบบ: scrypt$N$r$p$salt(b64)$hash(b64)
export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(pw, salt, SCRYPT_N, SCRYPT_R, SCRYPT_P);
  return ["scrypt", SCRYPT_N, SCRYPT_R, SCRYPT_P, salt.toString("base64"), key.toString("base64")].join("$");
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [n, r, p] = [Number(parts[1]), Number(parts[2]), Number(parts[3])];
  if (![n, r, p].every((x) => Number.isInteger(x) && x > 0)) return false;
  const salt = Buffer.from(parts[4], "base64");
  const expected = Buffer.from(parts[5], "base64");
  if (expected.length !== KEYLEN) return false;
  const actual = await scrypt(pw, salt, n, r, p);
  return timingSafeEqual(actual, expected);
}

// ใช้เทียบเวลาตอนไม่พบอีเมล กันเดาว่าอีเมลไหนมีบัญชีจากความเร็วการตอบ
export const DUMMY_HASH =
  "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$" + Buffer.alloc(KEYLEN).toString("base64");

// ---------- โทเคนในลิงก์อีเมล ----------

export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

export function sha256Hex(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

// ---------- คุกกี้เซสชันแบบเซ็นลายเซ็น ----------

export type SessionPayload = {
  u: string; // uid
  v: number; // tokenVersion (เพิ่มค่าเพื่อเพิกถอนเซสชันทั้งหมด)
  x: number; // หมดอายุ (epoch ms)
};

function sign(data: string, secret: string): string {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

export function signSession(payload: SessionPayload, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body, secret)}`;
}

export function verifySessionToken(
  token: string,
  secret: string,
  now = Date.now()
): SessionPayload | null {
  const i = token.indexOf(".");
  if (i <= 0) return null;
  const body = token.slice(0, i);
  const sig = token.slice(i + 1);
  const expected = sign(body, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Partial<SessionPayload>;
    if (typeof p.u !== "string" || !p.u) return null;
    if (typeof p.v !== "number" || typeof p.x !== "number") return null;
    if (p.x <= now) return null;
    return { u: p.u, v: p.v, x: p.x };
  } catch {
    return null;
  }
}
