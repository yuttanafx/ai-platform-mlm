import { NextResponse } from "next/server";
import { APP_NAME } from "@/lib/config";
import { mailConfigured, resetMail, sendMail, siteOrigin } from "@/lib/mail";
import { normalizeEmail } from "@/lib/security";
import { createToken, findUserByEmail, touchMail } from "@/lib/users";

export const runtime = "nodejs";

// ขอลิงก์ตั้งรหัสผ่านใหม่ ตอบเหมือนกันเสมอไม่ว่าอีเมลนั้นมีบัญชีหรือไม่
export async function POST(req: Request) {
  if (!mailConfigured()) {
    return NextResponse.json(
      { error: "ระบบยังไม่ได้เปิดการส่งอีเมล กรุณาติดต่อผู้ดูแลเพื่อรีเซ็ตรหัสผ่าน" },
      { status: 503 }
    );
  }
  const generic = NextResponse.json({ ok: true });
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
    if (!user || user.disabled) return generic;
    if (user.lastMailAt && Date.now() - user.lastMailAt < 60_000) return generic;
    const token = await createToken(user.uid, "reset", 60 * 60 * 1000);
    const m = resetMail(APP_NAME, `${siteOrigin(req)}/reset?token=${token}`);
    await sendMail(email, m.subject, m.html);
    await touchMail(user.uid);
  } catch (err) {
    console.error("forgot error:", err);
  }
  return generic;
}
