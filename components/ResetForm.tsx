"use client";

import { useState } from "react";
import { APP_NAME } from "@/lib/config";

export default function ResetForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("รหัสผ่านสองช่องไม่ตรงกัน");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.ok) setDone(true);
      else setError(data.error ?? "เกิดข้อผิดพลาด กรุณาลองใหม่");
    } catch {
      setError("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page narrow">
      <h1>{APP_NAME}</h1>
      <p className="muted">ตั้งรหัสผ่านใหม่</p>
      {done ? (
        <>
          <div className="notice" role="status">
            ตั้งรหัสผ่านใหม่เรียบร้อยแล้ว
          </div>
          <p>
            <a href="/login">ไปหน้าเข้าสู่ระบบ</a>
          </p>
        </>
      ) : !token ? (
        <>
          <div className="error" role="alert">
            ลิงก์ไม่ถูกต้อง กรุณาขอลิงก์ตั้งรหัสผ่านใหม่อีกครั้งจากหน้าเข้าสู่ระบบ
          </div>
          <p>
            <a href="/login">กลับไปหน้าเข้าสู่ระบบ</a>
          </p>
        </>
      ) : (
        <form onSubmit={submit} className="stack">
          <label>
            รหัสผ่านใหม่
            <input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
          </label>
          <label>
            ยืนยันรหัสผ่านใหม่
            <input type="password" required minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
          </label>
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          <button className="send" type="submit" disabled={busy}>
            {busy ? "กำลังบันทึก..." : "บันทึกรหัสผ่านใหม่"}
          </button>
        </form>
      )}
    </div>
  );
}
