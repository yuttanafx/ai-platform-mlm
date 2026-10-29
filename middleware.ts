import { NextResponse, type NextRequest } from "next/server";

// Middleware รันบน Edge ซึ่งใช้ firebase-admin ไม่ได้ จึงเช็คแค่ "มีคุกกี้หรือไม่" เพื่อเด้งไปหน้าล็อกอินเร็ว ๆ (หน้าแรกเปิดให้พิมพ์ได้เลย ระบบจะขึ้นป๊อปอัพให้ล็อกอินตอนกดส่ง)
// การตรวจจริง (ลายเซ็น/หมดอายุ/ถูกพัก) ทำที่ getSessionUser() ในทุกหน้าและทุก API
export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isPublic = path === "/" || path.startsWith("/login") || path.startsWith("/reset");
  if (!request.cookies.get("session")?.value && !isPublic) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

// ยกเว้น: ไฟล์ที่มีนามสกุล (รูป ฟอนต์ ไอคอน ฯลฯ ผู้เยี่ยมชมที่ยังไม่ล็อกอินต้องโหลดได้ ไม่งั้นรูปจะพังเพราะถูกเด้งไปหน้าล็อกอิน)
// /api จัดการสิทธิ์เอง (และ webhook ต้องเข้าได้โดยไม่ล็อกอิน)
export const config = {
  matcher: ["/((?!_next/|api/|.*\\.[a-zA-Z0-9]+$).*)"],
};
