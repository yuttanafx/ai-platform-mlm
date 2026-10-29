"use client";

import { useState } from "react";

export default function CheckoutButton({ label }: { label: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setLoading(true);
    setError(null);
    // ถ้าหน้านี้ถูกฝังในกรอบของเว็บอื่น Stripe Checkout ฝังไม่ได้ → เปิดแท็บใหม่ (เปิดหน้าต่างก่อน fetch กัน popup ถูกบล็อก)
    const inFrame = window.self !== window.top;
    const tab = inFrame ? window.open("", "_blank") : null;
    try {
      const res = await fetch("/api/checkout", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error ?? "สร้างรายการชำระเงินไม่สำเร็จ");
      if (tab) {
        tab.location.href = data.url;
        setLoading(false);
      } else if (inFrame) {
        window.open(data.url, "_blank");
        setLoading(false);
      } else {
        window.location.href = data.url;
      }
    } catch (e) {
      tab?.close();
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
