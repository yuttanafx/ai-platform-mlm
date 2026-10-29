"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function PaymentRequestActions({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: "approve" | "reject") {
    let reason = "";
    if (action === "approve") {
      if (!window.confirm("ยืนยันว่าได้รับเงินแล้ว และอนุมัติรายการนี้ใช่ไหม (ต่ออายุแพ็กเกจและคิดคอมมิชชั่นทันที)")) return;
    } else {
      const input = window.prompt("ปฏิเสธรายการนี้ — ใส่เหตุผล (ไม่บังคับ) แล้วกดตกลง", "");
      if (input === null) return;
      reason = input;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/payments/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action, reason }),
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

  return (
    <>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button className="send small" onClick={() => run("approve")} disabled={busy}>
          อนุมัติ
        </button>
        <button className="ghost danger" onClick={() => run("reject")} disabled={busy}>
          ปฏิเสธ
        </button>
      </div>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
    </>
  );
}
