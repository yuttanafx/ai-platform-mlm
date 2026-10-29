import { redirect } from "next/navigation";
import AccountNav from "@/components/AccountNav";
import CheckoutButton from "@/components/CheckoutButton";
import PaymentRequestForm from "@/components/PaymentRequestForm";
import { getSessionUser } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import {
  canBindReferrer,
  getPaymentInstructions,
  getProfile,
  isActive,
  listMyRequests,
} from "@/lib/store";
import { PLAN_DAYS, PLAN_NAME, PLAN_PRICE_SATANG } from "@/lib/config";

export default async function BillingPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const [profile, instructions, requests] = await Promise.all([
    getProfile(user.uid),
    getPaymentInstructions(),
    listMyRequests(user.uid),
  ]);
  const until = profile?.paidUntil ?? null;
  const active = isActive(profile);
  const price = (PLAN_PRICE_SATANG / 100).toLocaleString("th-TH");
  const hasPending = requests.some((r) => r.status === "pending");
  const statusLabel = { pending: "รอตรวจสอบ", approved: "อนุมัติแล้ว", rejected: "ไม่อนุมัติ" } as const;
  const statusClass = { pending: "badge", approved: "badge ok", rejected: "badge bad" } as const;

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

      <section className="card">
        <h2>ชำระแบบโอนเอง (แจ้งให้แอดมินตรวจสอบ)</h2>
        {instructions ? (
          <p className="pre-wrap">{instructions}</p>
        ) : (
          <p className="muted">ผู้ดูแลยังไม่ได้ระบุบัญชีรับชำระ กรุณาติดต่อผู้ดูแล</p>
        )}
        <p className="muted">
          โอน {price} บาทตามช่องทางด้านบน แล้วกรอกรายละเอียดด้านล่างเพื่อแจ้งชำระ
          เมื่อแอดมินอนุมัติ แพ็กเกจจะต่ออายุ {PLAN_DAYS} วันทันที
        </p>
        <PaymentRequestForm
          canBindReferrer={canBindReferrer(profile)}
          hasPending={hasPending}
          priceLabel={price}
        />
      </section>

      {requests.length > 0 && (
        <section className="card">
          <h2>รายการแจ้งชำระของคุณ</h2>
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>แจ้งเมื่อ</th>
                  <th>ช่องทาง</th>
                  <th>สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.id}>
                    <td>{r.createdAt.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}</td>
                    <td>{r.channel}</td>
                    <td>
                      <span className={statusClass[r.status]}>{statusLabel[r.status]}</span>
                      {r.rejectReason && <div className="muted small">{r.rejectReason}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
