"use client";

import { useState } from "react";

export default function CheckoutButton({ label }: { label: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/checkout", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error ?? "สร้างรายการชำระเงินไม่สำเร็จ");
      window.location.href = data.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
      setLoading(false);
    }
  }

  return (
    <>
      <button className="send" onClick={go} disabled={loading}>
        {loading ? "กำลังเปิดหน้าชำระเงิน..." : label}
      </button>
      {error && <div className="error" role="alert">{error}</div>}
    </>
  );
}
