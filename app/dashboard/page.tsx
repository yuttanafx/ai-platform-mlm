import { redirect } from "next/navigation";
import AccountNav from "@/components/AccountNav";
import { getSessionUser } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { pvExact, rankFor } from "@/lib/commission";
import { getCommissionSettings, getLedger, getProfile, getTeamPv } from "@/lib/store";

const pvFmt = (pv: number) =>
  pv.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const baht = (satang: number) =>
  (satang / 100).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const [profile, ledger] = await Promise.all([getProfile(user.uid), getLedger(user.uid)]);

  // จำนวนชั้นที่แสดง = จำนวนชั้นที่ตั้งไว้ในหน้าแอดมิน (อ่านไม่ได้ก็ใช้ 6)
  const [settings, teamPv] = await Promise.all([
    getCommissionSettings().catch(() => null),
    getTeamPv(user.uid).catch(() => 0),
  ]);
  const levelCount = settings?.weights.length ?? 6;
  const rank = settings ? rankFor(settings.ranks, teamPv) : null;
  const nextRank = settings?.ranks.find((r) => r.minTeamPv > teamPv) ?? null;

  const pvPerBaht = settings?.pvPerBaht ?? 1;
  const displayAs = settings?.displayAs ?? "baht";

  type Sum = { satang: number; pv: number };
  const zero = (): Sum => ({ satang: 0, pv: 0 });
  const add = (a: Sum, satang: number, pv: number): Sum => ({ satang: a.satang + satang, pv: a.pv + pv });

  const now = Date.now();
  const rows = Array.from({ length: levelCount }, (_, i) => {
    const level = i + 1;
    const members = profile?.downline[i] ?? 0;
    let held = zero();
    let ready = zero();
    let paid = zero();
    for (const r of ledger) {
      if (r.level !== level) continue;
      const pv = r.pv ?? pvExact(r.amountSatang, pvPerBaht);
      if (r.status === "paid") paid = add(paid, r.amountSatang, pv);
      else if (r.status === "held") {
        if (r.availableAt.getTime() <= now) ready = add(ready, r.amountSatang, pv);
        else held = add(held, r.amountSatang, pv);
      }
    }
    return { level, members, held, ready, paid };
  });

  const total = rows.reduce(
    (a, r) => ({
      held: add(a.held, r.held.satang, r.held.pv),
      ready: add(a.ready, r.ready.satang, r.ready.pv),
      paid: add(a.paid, r.paid.satang, r.paid.pv),
    }),
    { held: zero(), ready: zero(), paid: zero() }
  );

  // แสดงยอดตามที่แอดมินตั้ง: เป็น PV / เป็นบาท / ทั้งสองอย่าง
  const money = (x: Sum) => {
    if (displayAs === "baht") return baht(x.satang);
    if (displayAs === "pv") return `${pvFmt(x.pv)} PV`;
    return (
      <>
        {pvFmt(x.pv)} PV
        <div className="muted small">{baht(x.satang)} บาท</div>
      </>
    );
  };

  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const link = `${site}/login?ref=${profile?.referralCode ?? ""}`;

  return (
    <div className="page">
      <div className="page-head">
        <h1>คอมมิชชั่น</h1>
        <AccountNav isAdmin={isAdminEmail(user.email)} />
      </div>

      <section className="card">
        <h2>ลิงก์แนะนำของคุณ</h2>
        <input readOnly value={link} aria-label="ลิงก์แนะนำ" className="copy" />
        <p className="muted">
          คุณได้คอมมิชชั่นจากค่าใช้บริการที่ผู้ใช้ในสายของคุณชำระจริง สูงสุด {levelCount} ชั้น
          ยอดจะอยู่ในสถานะ “รอครบกำหนด” ก่อน เผื่อมีการคืนเงิน
        </p>
      </section>

      {settings && rank && (
        <section className="card">
          <h2>ยศและ PV ทีม</h2>
          <p>
            ยศตอนนี้: <strong>{rank.name}</strong> (รับคอมมิชชั่นได้ {rank.levels} ชั้น)
          </p>
          <p className="muted">
            PV ทีมเดือนนี้ {teamPv.toLocaleString("th-TH")} PV นับจากค่าบริการที่สมาชิกในสายล่างของคุณชำระจริง
            {nextRank
              ? ` อีก ${(nextRank.minTeamPv - teamPv).toLocaleString("th-TH")} PV จะได้ยศ ${nextRank.name}`
              : " (ถึงยศสูงสุดแล้ว)"}
            {settings.requireActive && " ต้องมีแพ็กเกจที่ยังไม่หมดอายุจึงจะรับคอมมิชชั่น"}
            {" "}ยอดนับใหม่ทุกต้นเดือน
          </p>
        </section>
      )}

      <section className="card">
        <h2>สรุปตามชั้น</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ชั้น</th>
                <th>สมาชิก</th>
                <th>รอครบกำหนด</th>
                <th>พร้อมจ่าย</th>
                <th>จ่ายแล้ว</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.level}>
                  <td>{r.level}</td>
                  <td>{r.members}</td>
                  <td>{money(r.held)}</td>
                  <td>{money(r.ready)}</td>
                  <td>{money(r.paid)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2}>รวม{displayAs === "baht" ? " (บาท)" : ""}</td>
                <td>{money(total.held)}</td>
                <td>{money(total.ready)}</td>
                <td>{money(total.paid)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </div>
  );
}
