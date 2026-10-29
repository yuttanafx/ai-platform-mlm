import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/admin";
import { PAYMENT_INSTRUCTIONS_MAX, savePaymentInstructions } from "@/lib/store";

export const runtime = "nodejs";

const err = (error: string, status: number) => NextResponse.json({ error }, { status });

// แอดมินกรอกข้อความช่องทางรับชำระ (เช่น ธนาคาร/เลขบัญชี/พร้อมเพย์) ที่สมาชิกเห็นในหน้าแพ็กเกจ
export async function POST(req: Request) {
  const admin = await getAdmin();
  if (!admin) return err("ไม่มีสิทธิ์", 403);

  let body: { instructions?: unknown };
  try {
    body = await req.json();
  } catch {
    return err("รูปแบบคำขอไม่ถูกต้อง", 400);
  }
  if (typeof body.instructions !== "string") return err("รูปแบบคำขอไม่ถูกต้อง", 400);
  const instructions = body.instructions.trim();
  if (instructions.length > PAYMENT_INSTRUCTIONS_MAX) {
    return err(`ข้อความยาวเกิน ${PAYMENT_INSTRUCTIONS_MAX} ตัวอักษร`, 400);
  }

  try {
    await savePaymentInstructions(instructions, admin);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("save payment instructions failed:", e);
    return err("บันทึกไม่สำเร็จ", 500);
  }
}
