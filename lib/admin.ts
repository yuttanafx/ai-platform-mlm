import { getSessionUser, type SessionUser } from "@/lib/auth";

// แอดมินกำหนดด้วยรายการอีเมลในตัวแปร ADMIN_EMAILS (คั่นด้วยจุลภาค) ไม่มีรหัสผ่านแอดมินแยก
// แอดมินล็อกอินด้วยบัญชีสมาชิกปกติของตัวเอง (ถ้าเปิดระบบอีเมลไว้ จะต้องยืนยันอีเมลแล้ว)
function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  return !!email && adminEmails().includes(email.toLowerCase());
}

export async function getAdmin(): Promise<SessionUser | null> {
  const user = await getSessionUser();
  return user && isAdminEmail(user.email) ? user : null;
}
