import { NextResponse } from "next/server";
import { getAdmin, isAdminEmail } from "@/lib/admin";
import { getProfile, setSuspended } from "@/lib/store";

export const runtime = "nodejs";

const err = (error: string, status: number) => NextResponse.json({ error }, { status });

export async function POST(req: Request) {
  const admin = await getAdmin();
  if (!admin) return err("ไม่มีสิทธิ์", 403);

  let body: { uid?: unknown; suspended?: unknown; reason?: unknown };
  try {
    body = await req.json();
  } catch {
    return err("รูปแบบคำขอไม่ถูกต้อง", 400);
  }
  const { uid, suspended } = body;
  if (typeof uid !== "string" || !uid || typeof suspended !== "boolean") {
    return err("รูปแบบคำขอไม่ถูกต้อง", 400);
  }
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 200) : "";

  if (uid === admin.uid) return err("พักบัญชีของตัวเองไม่ได้", 400);
  const target = await getProfile(uid);
  if (!target) return err("ไม่พบสมาชิก", 404);
  if (isAdminEmail(target.email)) return err("พักบัญชีแอดมินด้วยกันไม่ได้", 400);

  try {
    await setSuspended(uid, suspended, reason, admin);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("suspend failed:", e);
    return err("ดำเนินการไม่สำเร็จ", 500);
  }
}
