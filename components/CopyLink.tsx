"use client";

import { useState } from "react";

// ช่องแสดงลิงก์เต็ม + ปุ่มคัดลอก
export default function CopyLink({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // เบราว์เซอร์ไม่อนุญาต: เลือกข้อความในช่องให้ผู้ใช้กดคัดลอกเอง
      const el = document.getElementById("referral-link") as HTMLInputElement | null;
      el?.select();
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <input
        id="referral-link"
        readOnly
        value={value}
        aria-label="ลิงก์แนะนำ"
        className="copy"
        style={{ flex: 1, minWidth: 0 }}
        onFocus={(e) => e.currentTarget.select()}
      />
      <button type="button" className="ghost" onClick={copy}>
        {copied ? "คัดลอกแล้ว" : "คัดลอก"}
      </button>
    </div>
  );
}
