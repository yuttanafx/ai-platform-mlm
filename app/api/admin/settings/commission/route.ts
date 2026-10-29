import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/admin";
import { validateAdminSettings } from "@/lib/commission";
import { saveCommissionSettings } from "@/lib/store";

export const runtime = "nodejs";

const err = (error: string, status: number) => NextResponse.json({ error }, { status });

export async function POST(req: Request) {
  const admin = await getAdmin();
  if (!admin) return err("ไม่มีสิทธิ์", 403);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return err("รูปแบบคำขอไม่ถูกต้อง", 400);
  }

  let settings;
  try {
    settings = validateAdminSettings(body);
  } catch (e) {
    return err(e instanceof Error ? e.message : "ข้อมูลไม่ถูกต้อง", 400);
  }

  try {
    await saveCommissionSettings(settings, admin);
    return NextResponse.json({ ok: true, settings });
  } catch (e) {
    console.error("save commission settings failed:", e);
    return err("บันทึกไม่สำเร็จ", 500);
  }
}
