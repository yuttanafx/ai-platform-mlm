import { NextResponse } from "next/server";
import { APP_NAME } from "@/lib/config";
import { mailConfigured, sendMail, siteOrigin, verifyMail } from "@/lib/mail";
import { normalizeEmail } from "@/lib/security";
import { createToken, findUserByEmail, touchMail } from "@/lib/users";

export const runtime = "nodejs";

// ส่งลิงก์ยืนยันอีเมลอีกครั้ง ตอบเหมือนกันเสมอ (ไม่บอกว่าอีเมลนี้มีบัญชีหรือไม่) และส่งซ้ำได้ทุก 60 วินาที
export async function POST(req: Request) {
  const generic = NextResponse.json({ ok: true });
  if (!mailConfigured()) return generic;
  let body: { email?: unknown };
  try {
    body = await req.json();
  } catch {
    return generic;
  }
  const email = normalizeEmail(body.email);
  if (!email) return generic;

  try {
    const user = await findUserByEmail(email);
    if (!user || user.emailVerified || user.disabled) return generic;
    if (user.lastMailAt && Date.now() - user.lastMailAt < 60_000) return generic;
    const token = await createToken(user.uid, "verify", 24 * 60 * 60 * 1000);
    const m = verifyMail(APP_NAME, `${siteOrigin(req)}/api/auth/verify?token=${token}`);
    await sendMail(email, m.subject, m.html);
    await touchMail(user.uid);
  } catch (err) {
    console.error("resend error:", err);
  }
  return generic;
}
