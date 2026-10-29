import { notFound } from "next/navigation";
import Link from "next/link";
import AccountNav from "@/components/AccountNav";
import CommissionForm from "@/components/CommissionForm";
import MemberActions from "@/components/MemberActions";
import { getAdmin, isAdminEmail } from "@/lib/admin";
import { DEFAULT_SETTINGS } from "@/lib/commission";
import { getCommissionSettings, listMembers } from "@/lib/store";

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
