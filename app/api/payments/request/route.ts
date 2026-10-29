import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { PLAN_DAYS, PLAN_PRICE_SATANG } from "@/lib/config";
import {
  PendingRequestError,
  canBindReferrer,
  createPaymentRequest,
  getProfile,
  lookupReferrer,
} from "@/lib/store";

export const runtime = "nodejs";

const err = (error: string, status: number) => NextResponse.json({ error }, { status });
const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

// สมาชิกแจ้งว่าชำระเงินแล้ว (โอนเอง) รอแอดมินตรวจและอนุมัติ ราคา/จำนวนวันมาจากฝั่งเซิร์ฟเวอร์เท่านั้น
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return err("กรุณาเข้าสู่ระบบ", 401);

  let body: { channel?: unknown; note?: unknown; referrer?: unknown };
  try {
    body = await req.json();
  } catch {
    return err("รูปแบบคำขอไม่ถูกต้อง", 400);
  }
  const channel = text(body.channel, 100);
  const note = text(body.note, 500);
  const referrerInput = text(body.referrer, 200);
  if (!channel) return err("กรุณาระบุช่องทางชำระค่าบริการ", 400);

  const profile = await getProfile(user.uid);
  if (!profile) return err("ไม่พบโปรไฟล์สมาชิก", 404);

  let referrerCode: string | null = null;
  if (referrerInput) {
    if (!canBindReferrer(profile)) {
      return err("บัญชีนี้ระบุผู้แนะนำเพิ่มไม่ได้แล้ว (มีผู้แนะนำ เคยชำระเงิน หรือมีสายล่างแล้ว)", 400);
    }
    const ref = await lookupReferrer(referrerInput);
    if (!ref) return err("ไม่พบรหัสหรือลิงก์ผู้แนะนำนี้ กรุณาตรวจสอบอีกครั้ง", 400);
    if (ref.uid === user.uid) return err("ใช้รหัสของตัวเองไม่ได้", 400);
    referrerCode = ref.code;
  }

  try {
    await createPaymentRequest({
      uid: user.uid,
      email: user.email,
      channel,
      note,
      referrerInput,
      referrerCode,
      amountSatang: PLAN_PRICE_SATANG,
      days: PLAN_DAYS,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof PendingRequestError) {
      return err("คุณมีรายการแจ้งชำระที่รอตรวจสอบอยู่แล้ว กรุณารอแอดมินดำเนินการ", 409);
    }
    console.error("create payment request failed:", e);
    return err("บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง", 500);
  }
}
