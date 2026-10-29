"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function MemberActions({
  uid,
  suspended,
  locked,
}: {
  uid: string;
  suspended: boolean;
  locked: boolean; // ตัวเอง/แอดมินคนอื่น พักไม่ได้
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    let reason = "";
    if (suspended) {
      if (!window.confirm("ปลดพักบัญชีนี้ใช่ไหม")) return;
    } else {
      const input = window.prompt("พักบัญชีนี้ — ใส่เหตุผล (ไม่บังคับ) แล้วกดตกลง", "");
      if (input === null) return;
      reason = input;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/members/suspend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid, suspended: !suspended, reason }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "ดำเนินการไม่สำเร็จ");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    } finally {
      setBusy(false);
    }
  }

  if (locked) return <span className="muted">—</span>;
  return (
    <>
      <button className={suspended ? "ghost" : "ghost danger"} onClick={toggle} disabled={busy}>
        {suspended ? "ปลดพัก" : "พักบัญชี"}
      </button>
      {error && <div className="error" role="alert">{error}</div>}
    </>
  );
}
