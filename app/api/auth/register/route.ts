import { NextResponse } from "next/server";
import { setSessionCookie } from "@/lib/auth";
import { mailConfigured, sendMail, siteOrigin, verifyMail } from "@/lib/mail";
import { normalizeEmail, passwordError } from "@/lib/security";
import { APP_NAME } from "@/lib/config";
import { ensureProfile } from "@/lib/store";
import { EmailTakenError, createToken, createUser, touchMail } from "@/lib/users";

export const runtime = "nodejs";

const fail = (error: string, status: number, code?: string) =>
  NextResponse.json(code ? { error, code } : { error }, { status });

// สมัครสมาชิก: สร้างบัญชี + โปรไฟล์ + ผูกผู้แนะนำ (กำหนดได้ครั้งเดียวตอนนี้)
// ตั้งค่าอีเมลไว้ (RESEND_API_KEY + MAIL_FROM) = ส่งลิงก์ยืนยันก่อนใช้งาน / ไม่ตั้ง = ใช้งานได้ทันที
export async function POST(req: Request) {
  let body: { email?: unknown; password?: unknown; referralCode?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail("รูปแบบคำขอไม่ถูกต้อง", 400);
  }
  const email = normalizeEmail(body.email);
  if (!email) return fail("รูปแบบอีเมลไม่ถูกต้อง", 400);
  const pwErr = passwordError(body.password);
  if (pwErr) return fail(pwErr, 400);
  const referral = typeof body.referralCode === "string" ? body.referralCode : "";
  const mail = mailConfigured();

  let uid: string;
  try {
    uid = await createUser(email, body.password as string, !mail);
  } catch (err) {
    if (err instanceof EmailTakenError) return fail("อีเมลนี้ถูกใช้สมัครแล้ว", 409);
    console.error("register createUser error:", err);
    return serverError(err);
  }

  try {
    await ensureProfile(uid, email, referral);
  } catch (err) {
    console.error("register ensureProfile error:", err);
    return serverError(err);
  }

  if (!mail) {
    const res = NextResponse.json({ ok: true, loggedIn: true });
    setSessionCookie(res, uid, 0);
    return res;
  }

  try {
    const token = await createToken(uid, "verify", 24 * 60 * 60 * 1000);
    const m = verifyMail(APP_NAME, `${siteOrigin(req)}/api/auth/verify?token=${token}`);
    await sendMail(email, m.subject, m.html);
    await touchMail(uid);
    return NextResponse.json({ ok: true, needVerify: true });
  } catch (err) {
    console.error("register send mail error:", err);
    return NextResponse.json({ ok: true, needVerify: true, mailFailed: true });
  }
}

function serverError(err: unknown) {
  // แนบรหัสสั้น ๆ ให้หน้าเว็บแสดง จะได้รู้สาเหตุ (เช่น 5 = ยังไม่ได้สร้าง Firestore, 16/7 = คีย์ service account ใช้ไม่ได้)
  const e = err as { code?: string | number; message?: string };
  const code = String(e.code ?? e.message ?? "unknown").slice(0, 100);
  return fail("เกิดข้อผิดพลาดที่เซิร์ฟเวอร์", 500, code);
}
