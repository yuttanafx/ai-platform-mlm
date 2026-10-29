import { NextResponse } from "next/server";
import { markVerified, readToken } from "@/lib/users";

export const runtime = "nodejs";

// ลิงก์ในอีเมลยืนยัน: ยืนยันแล้วเด้งไปหน้าล็อกอิน (ไม่ลบโทเคนทันที กันระบบสแกนอีเมลกดลิงก์ก่อนผู้ใช้)
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  let ok = false;
  try {
    const uid = await readToken(token, "verify", false);
    if (uid) {
      await markVerified(uid);
      ok = true;
    }
  } catch (err) {
    console.error("verify error:", err);
  }
  return NextResponse.redirect(new URL(`/login?verified=${ok ? 1 : 0}`, req.url), { status: 303 });
}
