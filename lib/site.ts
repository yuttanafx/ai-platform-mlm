import { headers } from "next/headers";

// ที่อยู่เว็บเต็ม (เช่น https://example.com) ใช้ NEXT_PUBLIC_SITE_URL ถ้าตั้งไว้ ไม่ตั้งก็อ่านจากโดเมนที่ผู้ใช้เปิดอยู่จริง
export async function siteUrl(): Promise<string> {
  const env = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, "");
  if (env) return env;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return "";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
