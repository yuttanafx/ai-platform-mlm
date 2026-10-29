"use client";

import { useEffect, useState } from "react";

const BG = { light: "#ffffff", dark: "#111e34" };

// สลับโหมดกลางวัน/กลางคืน จำค่าไว้ในเบราว์เซอร์ (ค่าเริ่มต้นคือกลางวัน)
// สคริปต์ใน layout.tsx ตั้ง data-theme ก่อนวาดหน้า จึงไม่กะพริบ
export default function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.dataset.theme === "dark");
  }, []);

  function toggle() {
    const next = !dark;
    const theme = next ? "dark" : "light";
    setDark(next);
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("theme", theme);
    } catch {}
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", BG[theme]);
  }

  return (
    <button
      type="button"
      className="ghost theme-toggle"
      onClick={toggle}
      aria-pressed={dark}
      aria-label={dark ? "สลับเป็นโหมดกลางวัน" : "สลับเป็นโหมดกลางคืน"}
    >
      {dark ? "กลางวัน" : "กลางคืน"}
    </button>
  );
}
