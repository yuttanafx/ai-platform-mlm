import { NextResponse, type NextRequest } from "next/server";

// Middleware รันบน Edge ซึ่งใช้ firebase-admin ไม่ได้ จึงเช็คแค่ "มีคุกกี้หรือไม่" เพื่อเด้งไปหน้าล็อกอินเร็ว ๆ (หน้าแรกเปิดให้พิมพ์ได้เลย ระบบจะขึ้นป๊อปอัพให้ล็อกอินตอนกดส่ง)
// การตรวจจริง (ลายเซ็น/หมดอายุ/ถูกพัก) ทำที่ getSessionUser() ในทุกหน้าและทุก API
export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // กัน CSRF: คุกกี้เซสชันเป็น SameSite=None (เพื่อให้ใช้ในกรอบได้) จึงรับคำขอที่แก้ข้อมูล (ไม่ใช่ GET/HEAD) เฉพาะที่มาจากโดเมนเดียวกัน
  // ยกเว้น webhook (Stripe ไม่มี Origin และตรวจลายเซ็นเองอยู่แล้ว)
  const method = request.method;
  if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS" && !path.startsWith("/api/webhooks/")) {
    const origin = request.headers.get("origin");
    if (origin) {
      let ok = false;
      try {
        ok = new URL(origin).host === request.nextUrl.host;
      } catch {
        ok = false;
      }
      if (!ok) return NextResponse.json({ error: "คำขอไม่ถูกต้อง" }, { status: 403 });
    }
  }
  if (path.startsWith("/api/")) return NextResponse.next();

  const isPublic = path === "/" || path.startsWith("/login") || path.startsWith("/reset");
  if (!request.cookies.get("session")?.value && !isPublic) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

// ยกเว้น: ไฟล์ที่มีนามสกุล (รูป ฟอนต์ ไอคอน ฯลฯ ผู้เยี่ยมชมที่ยังไม่ล็อกอินต้องโหลดได้ ไม่งั้นรูปจะพังเพราะถูกเด้งไปหน้าล็อกอิน)
// /api เข้ามาที่นี่เพื่อเช็ก Origin อย่างเดียว (ส่วนสิทธิ์แต่ละ API จัดการเอง)
export const config = {
  matcher: ["/((?!_next/|.*\\.[a-zA-Z0-9]+$).*)"],
};
