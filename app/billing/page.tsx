import { redirect } from "next/navigation";
import AccountNav from "@/components/AccountNav";
import CheckoutButton from "@/components/CheckoutButton";
import { getSessionUser } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { getProfile, isActive } from "@/lib/store";
import { PLAN_DAYS, PLAN_NAME, PLAN_PRICE_SATANG } from "@/lib/config";

export default async function BillingPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const profile = await getProfile(user.uid);
  const until = profile?.paidUntil ?? null;
  const active = isActive(profile);
  const price = (PLAN_PRICE_SATANG / 100).toLocaleString("th-TH");

  return (
    <div className="page">
      <div className="page-head">
        <h1>แพ็กเกจ</h1>
        <AccountNav isAdmin={isAdminEmail(user.email)} />
      </div>

      <section className="card">
        <h2>{PLAN_NAME}</h2>
        <p className="muted">
          {price} บาท ต่ออายุการใช้งาน {PLAN_DAYS} วัน ชำระด้วย PromptPay หรือบัตร
        </p>
        <p>
          {active
            ? `ใช้งานได้ถึง ${until!.toLocaleDateString("th-TH", { dateStyle: "long" })}`
            : "ยังไม่มีแพ็กเกจที่ใช้งานได้"}
        </p>
        <CheckoutButton label={active ? "ต่ออายุ" : "ชำระเงินเพื่อเริ่มใช้งาน"} />
      </section>
    </div>
  );
}
