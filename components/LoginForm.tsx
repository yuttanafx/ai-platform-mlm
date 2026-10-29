"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { APP_NAME } from "@/lib/config";

type Mode = "in" | "up" | "forgot";

async function post(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    code?: string;
    [k: string]: unknown;
  };
  return { ok: res.ok, status: res.status, data };
}

function errorText(data: { error?: string; code?: string }) {
  const base = data.error ?? "เกิดข้อผิดพลาด กรุณาลองใหม่";
  return data.code && data.code !== "unverified" ? `${base} (รหัส: ${data.code})` : base;
}

export default function LoginForm({
  embedded = false,
  onSuccess,
}: {
  embedded?: boolean;
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [ref, setRef] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [needVerify, setNeedVerify] = useState(false); // บัญชีที่รอยืนยันอีเมล

  // รหัสแนะนำมาจากลิงก์ ?ref=XXXX และจำไว้เผื่อผู้ใช้เปลี่ยนหน้า / ?verified=1 มาจากลิงก์ยืนยันอีเมล
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const fromUrl = q.get("ref");
    if (fromUrl) {
      sessionStorage.setItem("ref", fromUrl);
      setRef(fromUrl);
      setMode("up");
    } else {
      setRef(sessionStorage.getItem("ref") ?? "");
    }
    const v = q.get("verified");
    if (v === "1") setInfo("ยืนยันอีเมลเรียบร้อยแล้ว เข้าสู่ระบบได้เลย");
    if (v === "0") setError("ลิงก์ยืนยันไม่ถูกต้องหรือหมดอายุ ลองเข้าสู่ระบบแล้วกด “ส่งลิงก์ยืนยันอีกครั้ง”");
  }, []);

  function done() {
    if (onSuccess) onSuccess();
    else router.push("/");
    router.refresh();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    setNeedVerify(false);
    try {
      if (mode === "forgot") {
        const r = await post("/api/auth/forgot", { email });
        if (!r.ok) setError(errorText(r.data));
        else setInfo("ถ้าอีเมลนี้มีบัญชีอยู่ ระบบส่งลิงก์ตั้งรหัสผ่านใหม่ไปให้แล้ว กรุณาตรวจกล่องจดหมาย (รวมถึงจดหมายขยะ)");
        return;
      }

      if (mode === "in") {
        const r = await post("/api/auth/login", { email, password });
        if (r.ok) return done();
        if (r.data.code === "unverified") setNeedVerify(true);
        setError(errorText(r.data));
        return;
      }

      const r = await post("/api/auth/register", { email, password, referralCode: ref.trim() });
      if (!r.ok) {
        setError(errorText(r.data));
        return;
      }
      if (r.data.loggedIn) return done();
      // เปิดระบบอีเมลไว้: ต้องกดลิงก์ยืนยันก่อน
      setMode("in");
      setPassword("");
      if (r.data.mailFailed) {
        setNeedVerify(true);
        setError("สมัครแล้ว แต่ส่งอีเมลยืนยันไม่สำเร็จ กรุณากด “ส่งลิงก์ยืนยันอีกครั้ง”");
      } else {
        setInfo("ส่งลิงก์ยืนยันไปที่อีเมลแล้ว กดลิงก์ในอีเมล จากนั้นกลับมาเข้าสู่ระบบ");
      }
    } catch {
      setError("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่");
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    await post("/api/auth/resend", { email });
    setError(null);
    setNeedVerify(false);
    setInfo("ถ้าอีเมลนี้ยังไม่ได้ยืนยัน ระบบส่งลิงก์ให้อีกครั้งแล้ว (ส่งซ้ำได้ทุก 1 นาที)");
  }

  const title = mode === "in" ? "เข้าสู่ระบบ" : mode === "up" ? "สมัครสมาชิก" : "ลืมรหัสผ่าน";

  return (
    <div className={embedded ? "auth-embedded" : "page narrow"}>
      {embedded ? <h2>{APP_NAME}</h2> : <h1>{APP_NAME}</h1>}
      <p className="muted">{title}</p>

      <form onSubmit={submit} className="stack">
        <label>
          อีเมล
          <input
            type="email"
            required
            autoFocus={embedded}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </label>
        {mode !== "forgot" && (
          <label>
            รหัสผ่าน
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "in" ? "current-password" : "new-password"}
            />
          </label>
        )}
        {mode === "in" && (
          <button
            type="button"
            className="ghost"
            onClick={() => {
              setMode("forgot");
              setError(null);
              setInfo(null);
              setNeedVerify(false);
            }}
          >
            ลืมรหัสผ่าน?
          </button>
        )}
        {mode === "up" && (
          <label>
            รหัสผู้แนะนำ (ถ้ามี)
            <input value={ref} onChange={(e) => setRef(e.target.value)} autoCapitalize="characters" />
          </label>
        )}
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        {needVerify && (
          <button type="button" className="ghost" onClick={resend}>
            ส่งลิงก์ยืนยันอีกครั้ง
          </button>
        )}
        {info && (
          <div className="notice" role="status">
            {info}
          </div>
        )}
        <button className="send" type="submit" disabled={busy}>
          {busy ? "กำลังดำเนินการ..." : mode === "in" ? "เข้าสู่ระบบ" : mode === "up" ? "สมัครสมาชิก" : "ส่งลิงก์ตั้งรหัสผ่านใหม่"}
        </button>
      </form>

      <button
        className="ghost"
        onClick={() => {
          setMode(mode === "in" ? "up" : "in");
          setError(null);
          setInfo(null);
          setNeedVerify(false);
        }}
      >
        {mode === "in" ? "ยังไม่มีบัญชี? สมัครสมาชิก" : mode === "up" ? "มีบัญชีแล้ว? เข้าสู่ระบบ" : "กลับไปเข้าสู่ระบบ"}
      </button>
    </div>
  );
}
