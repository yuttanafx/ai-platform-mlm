import { NextResponse } from "next/server";
import { setSessionCookie } from "@/lib/auth";
import { DUMMY_HASH, normalizeEmail, verifyPassword } from "@/lib/security";
import { ensureProfile } from "@/lib/store";
import { clearFailures, findUserByEmail, isThrottled, recordFailure } from "@/lib/users";

export const runtime = "nodejs";

const fail = (error: string, status: number, code?: string) =>
  NextResponse.json(code ? { error, code } : { error }, { status });

export async function POST(req: Request) {
  let body: { email?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail("รูปแบบคำขอไม่ถูกต้อง", 400);
  }
  const email = normalizeEmail(body.email);
  const password = typeof body.password === "string" ? body.password.slice(0, 200) : "";
  if (!email || !password) return fail("อีเมลหรือรหัสผ่านไม่ถูกต้อง", 401);

  try {
    if (await isThrottled(email)) {
      return fail("ลองหลายครั้งเกินไป กรุณารอ 15 นาทีแล้วลองใหม่", 429);
    }

    const user = await findUserByEmail(email);
    // ไม่พบอีเมลก็ยังคำนวณแฮชเทียบ เพื่อให้ใช้เวลาใกล้เคียงกัน
    const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok) {
      await recordFailure(email);
      return fail("อีเมลหรือรหัสผ่านไม่ถูกต้อง", 401);
    }
    if (user.disabled) return fail("บัญชีนี้ถูกพักการใช้งาน กรุณาติดต่อผู้ดูแล", 403);
    if (!user.emailVerified) {
      return fail("ยังไม่ได้ยืนยันอีเมล กรุณากดลิงก์ในอีเมลที่เราส่งให้ตอนสมัคร", 403, "unverified");
    }

    await clearFailures(email);
    await ensureProfile(user.uid, user.email); // กันกรณีสมัครค้างกลางทาง (ถ้ามีโปรไฟล์แล้วไม่ทำอะไร)
    const res = NextResponse.json({ ok: true });
    setSessionCookie(res, user.uid, user.tokenVersion);
    return res;
  } catch (err) {
    console.error("login error:", err);
    const e = err as { code?: string | number; message?: string };
    return fail("เกิดข้อผิดพลาดที่เซิร์ฟเวอร์", 500, String(e.code ?? e.message ?? "unknown").slice(0, 100));
  }
}
