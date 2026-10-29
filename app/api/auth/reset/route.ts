import { NextResponse } from "next/server";
import { passwordError } from "@/lib/security";
import { clearFailures, getUser, readToken, setPassword } from "@/lib/users";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: { token?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "รูปแบบคำขอไม่ถูกต้อง" }, { status: 400 });
  }
  const pwErr = passwordError(body.password);
  if (pwErr) return NextResponse.json({ error: pwErr }, { status: 400 });
  const token = typeof body.token === "string" ? body.token : "";

  try {
    const uid = await readToken(token, "reset", true); // ใช้ได้ครั้งเดียว
    if (!uid) {
      return NextResponse.json({ error: "ลิงก์ไม่ถูกต้องหรือหมดอายุ กรุณาขอลิงก์ใหม่" }, { status: 400 });
    }
    await setPassword(uid, body.password as string);
    const user = await getUser(uid);
    if (user) await clearFailures(user.email);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("reset error:", err);
    return NextResponse.json({ error: "เกิดข้อผิดพลาดที่เซิร์ฟเวอร์" }, { status: 500 });
  }
}
