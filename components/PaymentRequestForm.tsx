"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// ฟอร์มแจ้งชำระเงินแบบโอนเอง: ช่องทางที่ชำระ + บัญชี/หมายเหตุ + (ถ้าเข้าเงื่อนไข) รหัสหรือลิงก์ผู้แนะนำ
export default function PaymentRequestForm({
  canBindReferrer,
  hasPending,
  priceLabel,
}: {
  canBindReferrer: boolean;
  hasPending: boolean;
  priceLabel: string;
}) {
  const router = useRouter();
  const [channel, setChannel] = useState("");
  const [note, setNote] = useState("");
  const [referrer, setReferrer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch("/api/payments/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel, note, referrer }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "ส่งไม่สำเร็จ");
      setInfo("ส่งรายการแจ้งชำระแล้ว รอแอดมินตรวจสอบและอนุมัติ");
      setChannel("");
      setNote("");
      setReferrer("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="stack">
      <label>
        ช่องทางชำระค่าบริการ
        <input
          required
          maxLength={100}
          value={channel}
          onChange={(e) => setChannel(e.target.value)}
          placeholder="เช่น โอนผ่านแอปธนาคาร / พร้อมเพย์ / อื่น ๆ"
        />
      </label>
      <label>
        บัญชีที่โอนจาก / หมายเหตุการโอน
        <textarea
          rows={3}
          maxLength={500}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="ชื่อบัญชี เลขท้ายบัญชี วันเวลาที่โอน ยอด ฯลฯ"
        />
      </label>
      {canBindReferrer && (
        <label>
          รหัสหรือลิงก์ของสมาชิกที่แนะนำ (ถ้ามี)
          <input
            maxLength={200}
            value={referrer}
            onChange={(e) => setReferrer(e.target.value)}
            placeholder="วางลิงก์แนะนำ หรือรหัสของสมาชิกที่ชวนคุณ"
          />
          <span className="muted small">
            ยอดชำระนี้จะนับเป็น PV และคอมมิชชั่นให้สมาชิกคนนี้และสายบนของเขา ระบุได้ครั้งเดียว
            และเฉพาะบัญชีที่ยังไม่มีผู้แนะนำ ยังไม่เคยชำระเงิน
          </span>
        </label>
      )}
      {hasPending && (
        <div className="notice" role="status">
          คุณมีรายการที่รอตรวจสอบอยู่แล้ว รอแอดมินดำเนินการก่อนจึงจะแจ้งใหม่ได้
        </div>
      )}
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {info && (
        <div className="notice" role="status">
          {info}
        </div>
      )}
      <button className="send" type="submit" disabled={busy || hasPending}>
        {busy ? "กำลังส่ง..." : `แจ้งชำระเงิน ${priceLabel} บาท`}
      </button>
    </form>
  );
}
