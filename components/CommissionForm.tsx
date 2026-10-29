"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ADMIN_LIMITS, LEVELS, MAX_RANKS, levelPctsOf, type CommissionSettings, type DisplayAs } from "@/lib/commission";

export default function CommissionForm({ initial }: { initial: CommissionSettings }) {
  const router = useRouter();
  const [pcts, setPcts] = useState<string[]>(levelPctsOf(initial).map(String));
  const [holdDays, setHoldDays] = useState(String(initial.holdDays));
  const [pvPerBaht, setPvPerBaht] = useState(String(initial.pvPerBaht));
  const [requireActive, setRequireActive] = useState(initial.requireActive);
  const [displayAs, setDisplayAs] = useState<DisplayAs>(initial.displayAs);
  const [ranks, setRanks] = useState(
    initial.ranks.map((r) => ({ name: r.name, minTeamPv: String(r.minTeamPv), levels: String(r.levels) }))
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const num = (v: string) => (v.trim() === "" ? NaN : Number(v));
  const values = pcts.map(num);
  const valid = values.every((v) => Number.isFinite(v) && v >= 0);
  const total = valid ? values.reduce((a, b) => a + b, 0) : NaN;
  const overCap = valid && total > ADMIN_LIMITS.maxPoolPct + 1e-9;

  function setLevelCount(raw: string) {
    const n = Math.max(1, Math.min(LEVELS, Math.floor(Number(raw)) || 1));
    setPcts((a) => (n <= a.length ? a.slice(0, n) : [...a, ...Array(n - a.length).fill("0")]));
    // ยศที่เคยรับได้มากกว่าจำนวนชั้นใหม่ ให้ลดลงมาเท่าจำนวนชั้น
    setRanks((rs) => rs.map((r) => (Number(r.levels) > n ? { ...r, levels: String(n) } : r)));
  }
  const setRank = (i: number, patch: Partial<(typeof ranks)[number]>) =>
    setRanks((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const addRank = () =>
    setRanks((rs) => {
      const last = rs[rs.length - 1];
      return [...rs, { name: "", minTeamPv: String((Number(last.minTeamPv) || 0) + 1000), levels: last.levels }];
    });
  const removeRank = (i: number) => setRanks((rs) => rs.filter((_, j) => j !== i));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    if (!window.confirm("บันทึกอัตราใหม่ใช่ไหม? มีผลกับการชำระเงินครั้งถัดไปเท่านั้น รายการเก่าไม่เปลี่ยน")) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/settings/commission", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          levelPcts: values,
          holdDays: num(holdDays),
          pvPerBaht: num(pvPerBaht),
          requireActive,
          displayAs,
          ranks: ranks.map((r) => ({ name: r.name.trim(), minTeamPv: num(r.minTeamPv), levels: num(r.levels) })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "บันทึกไม่สำเร็จ");
      setSaved(true);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={save}>
      <label>
        จำนวนชั้นที่จ่ายคอมมิชชั่น (1-{LEVELS})
        <input
          type="number" inputMode="numeric" step={1} min={1} max={LEVELS}
          value={pcts.length} onChange={(e) => setLevelCount(e.target.value)} required
        />
      </label>

      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend>คอมมิชชั่นแต่ละชั้น (% ของยอดชำระ ทศนิยมได้ 2 ตำแหน่ง)</legend>
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr><th>ชั้น</th><th>คอมมิชชั่น (%)</th></tr>
            </thead>
            <tbody>
              {pcts.map((v, i) => (
                <tr key={i}>
                  <td>ชั้น {i + 1}</td>
                  <td>
                    <input
                      aria-label={`คอมมิชชั่นชั้น ${i + 1} เป็นเปอร์เซ็นต์`}
                      type="number" inputMode="decimal" step="0.01" min={0} max={ADMIN_LIMITS.maxPoolPct}
                      value={v} required
                      onChange={(e) => setPcts((a) => a.map((x, j) => (j === i ? e.target.value : x)))}
                    />
                  </td>
                </tr>
              ))}
              <tr>
                <td>รวม</td>
                <td>
                  {valid ? `${total.toFixed(2)}%` : "—"} (สูงสุด {ADMIN_LIMITS.maxPoolPct}%)
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        {overCap && (
          <div className="error" role="alert">
            ผลรวมเกิน {ADMIN_LIMITS.maxPoolPct}% ของยอดชำระ ลดตัวเลขลงก่อนบันทึก
          </div>
        )}
        <p className="muted small">
          ชั้นที่ไม่มีผู้รับ (สายบนสั้นกว่าจำนวนชั้น) ส่วนนั้นเข้าบริษัท ผลรวมที่จ่ายไม่เกินยอดชำระ x ผลรวมด้านบนเสมอ
        </p>
      </fieldset>

      <label>
        พักยอดกี่วันก่อนพร้อมจ่าย (0-{ADMIN_LIMITS.maxHoldDays})
        <input
          type="number" inputMode="numeric" step={1} min={0} max={ADMIN_LIMITS.maxHoldDays}
          value={holdDays} onChange={(e) => setHoldDays(e.target.value)} required
        />
      </label>

      <label>
        PV ต่อ 1 บาทของยอดชำระ
        <input
          type="number" inputMode="decimal" step="0.01" min={0.01} max={1000}
          value={pvPerBaht} onChange={(e) => setPvPerBaht(e.target.value)} required
        />
      </label>

      <label>
        แสดงยอดคอมมิชชั่นให้สมาชิกเป็น
        <select value={displayAs} onChange={(e) => setDisplayAs(e.target.value as DisplayAs)}>
          <option value="pv">PV อย่างเดียว</option>
          <option value="both">PV และบาท</option>
          <option value="baht">บาทอย่างเดียว</option>
        </select>
      </label>
      <p className="muted small">
        เป็นแค่วิธีแสดงผลในหน้าสมาชิก ยอดที่ใช้จ่ายเงินจริงยังเก็บและคิดเป็นสตางค์ ตามอัตรา PV ต่อบาทด้านบน ณ ตอนที่ชำระ
      </p>

      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend>ยศ (ดูจาก PV ทีมในเดือนนั้น = ค่าบริการที่สมาชิกในสายล่างจ่ายจริง)</legend>
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr><th>ชื่อยศ</th><th>PV ทีมขั้นต่ำ</th><th>รับได้กี่ชั้น</th><th></th></tr>
            </thead>
            <tbody>
              {ranks.map((r, i) => (
                <tr key={i}>
                  <td>
                    <input aria-label={`ชื่อยศที่ ${i + 1}`} value={r.name} maxLength={20} required
                      onChange={(e) => setRank(i, { name: e.target.value })} />
                  </td>
                  <td>
                    <input aria-label={`PV ทีมขั้นต่ำของยศที่ ${i + 1}`} type="number" inputMode="numeric"
                      step={1} min={0} value={i === 0 ? "0" : r.minTeamPv} disabled={i === 0} required
                      onChange={(e) => setRank(i, { minTeamPv: e.target.value })} />
                  </td>
                  <td>
                    <input aria-label={`จำนวนชั้นที่ยศที่ ${i + 1} รับได้`} type="number" inputMode="numeric"
                      step={1} min={1} max={pcts.length} value={r.levels} required
                      onChange={(e) => setRank(i, { levels: e.target.value })} />
                  </td>
                  <td>
                    {i > 0 && (
                      <button type="button" className="ghost danger" onClick={() => removeRank(i)}>ลบ</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {ranks.length < MAX_RANKS && (
          <button type="button" className="ghost" onClick={addRank}>เพิ่มยศ</button>
        )}
        <p className="muted small">
          ยศแรกคือยศเริ่มต้น (PV = 0) ชั้นที่เกินกว่าที่ยศรับได้ ส่วนนั้นเข้าบริษัท ไม่ได้จ่ายเพิ่มให้ใคร
          ยศไม่ได้เพิ่มเพดานรวม ผลรวมที่จ่ายยังไม่เกินเปอร์เซ็นต์รวมด้านบน
        </p>
      </fieldset>

      <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input type="checkbox" checked={requireActive} onChange={(e) => setRequireActive(e.target.checked)}
          style={{ width: "auto" }} />
        ผู้รับต้องมีแพ็กเกจที่ยังไม่หมดอายุ จึงจะได้คอมมิชชั่น
      </label>

      <button className="send" type="submit" disabled={busy || !valid || overCap}>
        {busy ? "กำลังบันทึก…" : "บันทึกอัตรา"}
      </button>
      {saved && <p role="status" className="muted">บันทึกแล้ว มีผลกับการชำระเงินครั้งถัดไป</p>}
      {error && <div className="error" role="alert">{error}</div>}
    </form>
  );
}
