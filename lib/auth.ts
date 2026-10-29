import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { signingMaterial } from "@/lib/firebase/admin";
import { signSession, verifySessionToken } from "@/lib/security";
import { getUser } from "@/lib/users";

export const SESSION_COOKIE = "session";
// อายุเซสชัน 5 วัน
export const SESSION_MAX_AGE_MS = 5 * 24 * 60 * 60 * 1000;

export type SessionUser = { uid: string; email: string | null };

// กุญแจเซ็นคุกกี้: ใช้ SESSION_SECRET ถ้าตั้งไว้ (ยาวอย่างน้อย 16 ตัว) ไม่ตั้งก็สร้างจาก private key ของ service account
// (ไม่มีใครมีกุญแจนี้นอกจากเซิร์ฟเวอร์ ไม่ต้องตั้งตัวแปรเพิ่ม)
function secret(): string {
  const s = process.env.SESSION_SECRET?.trim();
  if (s && s.length >= 16) return s;
  return createHash("sha256").update(`tvt-session:${signingMaterial()}`).digest("hex");
}

export function setSessionCookie(res: NextResponse, uid: string, tokenVersion: number) {
  const token = signSession({ u: uid, v: tokenVersion, x: Date.now() + SESSION_MAX_AGE_MS }, secret());
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_MS / 1000,
  });
}

// ตรวจลายเซ็น + อายุ แล้วเช็กกับฐานข้อมูลว่าบัญชียังไม่ถูกพัก และเซสชันยังไม่ถูกเพิกถอน
export async function getSessionUser(): Promise<SessionUser | null> {
  const value = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!value) return null;
  const payload = verifySessionToken(value, secret());
  if (!payload) return null;
  try {
    const user = await getUser(payload.u);
    if (!user || user.disabled || user.tokenVersion !== payload.v) return null;
    return { uid: user.uid, email: user.email };
  } catch {
    return null;
  }
}
