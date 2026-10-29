"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// แอดมินกรอกข้อความช่องทางรับชำระ (บัญชีธนาคาร พร้อมเพย์ ฯลฯ) สมาชิกเห็นในหน้าแพ็กเกจ
export default function PaymentSettingsForm({ initial, max }: { initial: string; max: number }) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch("/api/admin/settings/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instructions: value }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "บันทึกไม่สำเร็จ");
      setInfo("บันทึกแล้ว");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="stack">
      <label>
        ข้อความที่สมาชิกเห็น (ช่องทางรับชำระ / บัญชี)
        <textarea
          rows={5}
          maxLength={max}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={"เช่น\nธนาคารกสิกรไทย 123-4-56789-0 ชื่อบัญชี บริษัท ...\nพร้อมเพย์ 08x-xxx-xxxx"}
        />
        <span className="muted small">
          {value.length}/{max} ตัวอักษร
        </span>
      </label>
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
      <div>
        <button className="send" type="submit" disabled={busy}>
          {busy ? "กำลังบันทึก..." : "บันทึก"}
        </button>
      </div>
    </form>
  );
}
