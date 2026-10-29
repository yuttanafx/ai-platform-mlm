import { notFound } from "next/navigation";
import Link from "next/link";
import AccountNav from "@/components/AccountNav";
import CommissionForm from "@/components/CommissionForm";
import MemberActions from "@/components/MemberActions";
import PaymentRequestActions from "@/components/PaymentRequestActions";
import PaymentSettingsForm from "@/components/PaymentSettingsForm";
import { getAdmin, isAdminEmail } from "@/lib/admin";
import { DEFAULT_SETTINGS } from "@/lib/commission";
import { PLAN_PRICE_SATANG } from "@/lib/config";
import {
  PAYMENT_INSTRUCTIONS_MAX,
  getCommissionSettings,
  getPaymentInstructions,
  listMembers,
  listPendingRequests,
  lookupReferrer,
} from "@/lib/store";

const fmt = (d: Date | null) =>
  d ? d.toLocaleDateString("th-TH", { dateStyle: "medium" }) : "—";

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; after?: string }>;
}) {
  const admin = await getAdmin();
  if (!admin) notFound(); // คนทั่วไปไม่เห็นว่ามีหน้านี้อยู่

  const { q, after } = await searchParams;
  const { rows, total, nextAfter } = await listMembers({
    q,
    after: after ? Number(after) || undefined : undefined,
  });
  const now = new Date();

  const [instructions, pending] = await Promise.all([getPaymentInstructions(), listPendingRequests()]);
  const pendingRows = await Promise.all(
    pending.map(async (r) => ({
      r,
      referrer: r.referrerCode ? await lookupReferrer(r.referrerCode) : null,
    }))
  );

  // ถ้าเอกสารตั้งค่าใน Firestore ผิดรูปแบบ ให้บอกแอดมินแทนที่จะทำให้ทั้งหน้าพัง (ฟอร์มด้านล่างบันทึกทับได้)
  let rates: Awaited<ReturnType<typeof getCommissionSettings>> | null = null;
  let ratesError: string | null = null;
  try {
    rates = await getCommissionSettings();
  } catch (e) {
    ratesError = e instanceof Error ? e.message : "อ่านอัตราไม่ได้";
  }

  return (
    <div className="page wide">
      <div className="page-head">
        <h1>แอดมิน: สมาชิก</h1>
        <AccountNav isAdmin />
      </div>

      <section className="card">
        <h2>อัตราคอมมิชชั่น</h2>
        {ratesError && (
          <div className="error" role="alert">
            ค่าที่เก็บอยู่ผิดรูปแบบ ({ratesError}) ตอนนี้การชำระเงินจะถูกปฏิเสธจนกว่าจะบันทึกค่าใหม่
          </div>
        )}
        <CommissionForm initial={rates ?? DEFAULT_SETTINGS} />
      </section>

      <section className="card">
        <h2>ช่องทางรับชำระเงิน</h2>
        <p className="muted">ข้อความนี้แสดงให้สมาชิกเห็นในหน้าแพ็กเกจ ใช้บอกบัญชีธนาคารหรือพร้อมเพย์สำหรับโอนเอง</p>
        <PaymentSettingsForm initial={instructions} max={PAYMENT_INSTRUCTIONS_MAX} />
      </section>

      <section className="card">
        <h2>รายการแจ้งชำระรอตรวจสอบ ({pendingRows.length})</h2>
        <p className="muted">
          ตรวจว่าเงินเข้าบัญชีจริงก่อนกดอนุมัติ อนุมัติแล้วจะต่ออายุแพ็กเกจและคิด PV/คอมมิชชั่นให้สายบนทันที
          (ยอด {(PLAN_PRICE_SATANG / 100).toLocaleString("th-TH")} บาทต่อรายการ)
        </p>
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>สมาชิก</th>
                <th>ช่องทาง / หมายเหตุ</th>
                <th>ผู้แนะนำที่ระบุ</th>
                <th>แจ้งเมื่อ</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pendingRows.map(({ r, referrer }) => (
                <tr key={r.id}>
                  <td>{r.email ?? "—"}</td>
                  <td>
                    {r.channel}
                    {r.note && <div className="muted small pre-wrap">{r.note}</div>}
                  </td>
                  <td>
                    {r.referrerInput ? (
                      <>
                        {referrer ? `${referrer.email ?? "—"} (${referrer.code})` : r.referrerInput}
                        <div className="muted small">จะผูกให้ตอนอนุมัติ ถ้ายังเข้าเงื่อนไข</div>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>{r.createdAt.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}</td>
                  <td>
                    <PaymentRequestActions id={r.id} />
                  </td>
                </tr>
              ))}
              {pendingRows.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted">ไม่มีรายการรอตรวจสอบ</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2>สมาชิก</h2>
        <form className="search" action="/admin">
          <input name="q" defaultValue={q ?? ""} placeholder="ค้นหาด้วยอีเมล (ตรงทั้งหมด)" aria-label="ค้นหาอีเมล" />
          <button className="send" type="submit">ค้นหา</button>
          {q && <Link className="ghost" href="/admin">ล้าง</Link>}
        </form>
        <p className="muted">
          {q ? `ผลการค้นหา ${rows.length} รายการ` : `สมาชิกทั้งหมด ${total.toLocaleString("th-TH")} คน (เรียงจากสมัครล่าสุด)`}
        </p>

        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>อีเมล</th>
                <th>สมัครเมื่อ</th>
                <th>แพ็กเกจ</th>
                <th>ผู้แนะนำ</th>
                <th>แนะนำตรง</th>
                <th>สถานะ</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => {
                const active = !!m.paidUntil && m.paidUntil > now;
                return (
                  <tr key={m.uid}>
                    <td>
                      {m.email ?? "—"}
                      <div className="muted small">{m.referralCode}</div>
                    </td>
                    <td>{fmt(m.createdAt)}</td>
                    <td>{active ? `ถึง ${fmt(m.paidUntil)}` : "ไม่มี"}</td>
                    <td>{m.referrerEmail ?? "—"}</td>
                    <td>{m.directReferrals}</td>
                    <td>
                      {m.suspended ? (
                        <span className="badge bad">ถูกพัก</span>
                      ) : (
                        <span className="badge ok">ปกติ</span>
                      )}
                      {m.suspendedReason && <div className="muted small">{m.suspendedReason}</div>}
                    </td>
                    <td>
                      <MemberActions
                        uid={m.uid}
                        suspended={m.suspended}
                        locked={m.uid === admin.uid || isAdminEmail(m.email)}
                      />
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="muted">ไม่พบสมาชิก</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {nextAfter && (
          <p>
            <Link className="ghost" href={`/admin?after=${nextAfter}`}>หน้าถัดไป →</Link>
          </p>
        )}
      </section>
    </div>
  );
}
