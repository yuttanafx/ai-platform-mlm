import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/admin";
import { approvePaymentRequest, rejectPaymentRequest, type ResolveResult } from "@/lib/store";

export const runtime = "nodejs";

const err = (error: string, status: number) => NextResponse.json({ error }, { status });

function failure(r: ResolveResult) {
  if (r === "not_found") return err("ไม่พบรายการนี้", 404);
  if (r === "not_pending") return err("รายการนี้ถูกดำเนินการไปแล้ว", 409);
  return null;
}

export async function POST(req: Request) {
  const admin = await getAdmin();
  if (!admin) return err("ไม่มีสิทธิ์", 403);

  let body: { id?: unknown; action?: unknown; reason?: unknown };
  try {
    body = await req.json();
  } catch {
    return err("รูปแบบคำขอไม่ถูกต้อง", 400);
  }
  const { id, action } = body;
  if (typeof id !== "string" || !id || (action !== "approve" && action !== "reject")) {
    return err("รูปแบบคำขอไม่ถูกต้อง", 400);
  }

  try {
    if (action === "approve") {
      const r = await approvePaymentRequest(id, admin);
      return failure(r) ?? NextResponse.json({ ok: true });
    }
    const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 200) : "";
    const r = await rejectPaymentRequest(id, reason, admin);
    return failure(r) ?? NextResponse.json({ ok: true });
  } catch (e) {
    console.error("resolve payment request failed:", e);
    return err("ดำเนินการไม่สำเร็จ ลองใหม่อีกครั้ง", 500);
  }
}
