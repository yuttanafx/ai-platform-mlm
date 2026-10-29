import Chat from "@/components/Chat";
import { getSessionUser } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { getProfile, isActive } from "@/lib/store";
import { APP_NAME, APP_TAGLINE, SUGGESTIONS } from "@/lib/config";

// หน้าแรกเปิดให้ทุกคนเห็นและพิมพ์ได้ ส่วนสิทธิ์ใช้งานจริงตรวจที่ /api/chat เสมอ
export default async function Page() {
  const user = await getSessionUser();
  const status = !user
    ? "guest"
    : isActive(await getProfile(user.uid))
      ? "active"
      : "unpaid";

  return (
    <Chat appName={APP_NAME} tagline={APP_TAGLINE} suggestions={SUGGESTIONS} status={status}
      isAdmin={isAdminEmail(user?.email)}
    />
  );
}
