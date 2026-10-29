"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AccountNav from "@/components/AccountNav";
import ThemeToggle from "@/components/ThemeToggle";
import LoginForm from "@/components/LoginForm";
import Modal from "@/components/Modal";

type Message = { role: "user" | "assistant"; content: string };

type Status = "guest" | "unpaid" | "active";

type Props = {
  appName: string;
  tagline: string;
  suggestions: string[];
  status: Status;
  isAdmin?: boolean;
};

export default function Chat({ appName, tagline, suggestions, status: initial, isAdmin = false }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>(initial);
  const [modal, setModal] = useState<"auth" | "paywall" | null>(null);
  const pendingRef = useRef<string | null>(null); // ข้อความที่พิมพ์ไว้ก่อนล็อกอิน
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // หลังล็อกอินสำเร็จ router.refresh() จะส่งสถานะใหม่มา: ส่งข้อความที่ค้างไว้ต่อให้เลย
  useEffect(() => {
    setStatus(initial);
  }, [initial]);

  useEffect(() => {
    const pending = pendingRef.current;
    if (!pending || status === "guest") return;
    pendingRef.current = null;
    if (status === "active") {
      setModal(null);
      send(pending);
    } else {
      pendingRef.current = pending;
      setModal("paywall");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  // ปรับความสูงช่องพิมพ์ตามจำนวนบรรทัด
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [input]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || loading) return;

    // ยังไม่ล็อกอิน / ยังไม่มีแพ็กเกจ: เก็บข้อความไว้ในช่องพิมพ์แล้วขึ้นป๊อปอัพ
    if (status !== "active") {
      pendingRef.current = content;
      setModal(status === "guest" ? "auth" : "paywall");
      return;
    }

    setError(null);
    const history: Message[] = [...messages, { role: "user", content }];
    setMessages([...history, { role: "assistant", content: "" }]);
    setInput("");
    setLoading(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
        signal: controller.signal,
      });

      if (res.status === 401 || res.status === 402) {
        // เซสชันหมดอายุหรือแพ็กเกจหมดระหว่างใช้งาน
        pendingRef.current = content;
        setMessages(history.slice(0, -1));
        setInput(content);
        setStatus(res.status === 401 ? "guest" : "unpaid");
        setModal(res.status === 401 ? "auth" : "paywall");
        return;
      }

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let answer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        answer += decoder.decode(value, { stream: true });
        const snapshot = answer;
        setMessages((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = { role: "assistant", content: snapshot };
          return copy;
        });
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setError(
          e instanceof Error && e.message
            ? e.message
            : "เกิดข้อผิดพลาด ลองส่งใหม่อีกครั้ง"
        );
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
      // ถ้าไม่ได้คำตอบเลย ให้เอาช่องว่างของผู้ช่วยออก
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        return last && last.role === "assistant" && last.content === ""
          ? prev.slice(0, -1)
          : prev;
      });
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // isComposing กันการกด Enter ตอนยืนยันตัวอักษรจาก IME
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send(input);
    }
  }

  function reset() {
    abortRef.current?.abort();
    setMessages([]);
    setError(null);
    setInput("");
  }

  const empty = messages.length === 0;

  return (
    <div className="app">
      <header className="bar">
        <span className="brand-wrap">
          <span className="brand">{appName}</span>
        </span>
        <div className="bar-actions">
          {!empty && (
            <button className="ghost" onClick={reset}>
              แชตใหม่
            </button>
          )}
          {status === "guest" ? (
            <>
              <ThemeToggle />
              <button className="send small" onClick={() => setModal("auth")}>
                เข้าสู่ระบบ / สมัครสมาชิก
              </button>
            </>
          ) : (
            <AccountNav isAdmin={isAdmin} />
          )}
        </div>
      </header>

      <main className="thread">
        {empty ? (
          <section className="welcome">
            <h1>{appName}</h1>
            <p>{tagline}</p>
            <div className="suggestions">
              {suggestions.map((s) => (
                <button key={s} className="suggestion" onClick={() => send(s)}>
                  {s}
                </button>
              ))}
            </div>
          </section>
        ) : (
          <div className="messages">
            {messages.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="msg user">
                  {m.content}
                </div>
              ) : (
                <div key={i} className="msg assistant">
                  {m.content ? (
                    <ReactMarkdown>{m.content}</ReactMarkdown>
                  ) : (
                    <span className="thinking" aria-label="กำลังคิด" />
                  )}
                </div>
              )
            )}
            {error && (
              <div className="error" role="alert">
                {error}
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </main>

      <footer className="composer">
        <div className="field">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="พิมพ์ข้อความ (Shift+Enter เพื่อขึ้นบรรทัดใหม่)"
            rows={1}
            aria-label="ข้อความ"
          />
          {loading ? (
            <button
              className="send stop"
              onClick={() => abortRef.current?.abort()}
            >
              หยุด
            </button>
          ) : (
            <button
              className="send"
              onClick={() => send(input)}
              disabled={!input.trim()}
            >
              ส่ง
            </button>
          )}
        </div>
      </footer>

      {modal === "auth" && (
        <Modal label="เข้าสู่ระบบหรือสมัครสมาชิก" onClose={() => setModal(null)}>
          <p className="muted modal-note">
            เข้าสู่ระบบหรือสมัครสมาชิกเพื่อส่งข้อความ ข้อความที่พิมพ์ไว้จะยังอยู่
          </p>
          <LoginForm
            embedded
            onSuccess={() => {
              // เซสชันถูกตั้งแล้ว ให้หน้าโหลดสถานะใหม่ (ข้อความที่ค้างจะถูกส่งต่ออัตโนมัติ)
              router.refresh();
            }}
          />
        </Modal>
      )}

      {modal === "paywall" && (
        <Modal
          label="ต้องมีแพ็กเกจ"
          onClose={() => {
            pendingRef.current = null;
            setModal(null);
          }}
        >
          <h2>เริ่มใช้งานแพ็กเกจ</h2>
          <p className="muted modal-note">
            บัญชีของคุณยังไม่มีแพ็กเกจที่ใช้งานได้ ชำระเงินเพื่อเริ่มส่งข้อความ
          </p>
          <Link className="send link-btn" href="/billing">
            ไปหน้าแพ็กเกจ
          </Link>
        </Modal>
      )}
    </div>
  );
}
