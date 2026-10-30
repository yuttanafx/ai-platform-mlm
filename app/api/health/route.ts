import { adminDb } from "@/lib/firebase/admin";
import { summarizeHealth, type HealthResult } from "@/lib/health";
import { loadProviders, probeProvider } from "@/lib/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// หน้าตรวจสุขภาพระบบสำหรับบริการเฝ้าระวัง (UptimeRobot, Better Stack ฯลฯ) ไม่ต้องล็อกอิน
// ตอบเฉพาะผ่าน/ไม่ผ่าน ไม่เปิดเผยที่อยู่เซิร์ฟเวอร์ ชื่อโมเดล หรือรายละเอียดภายใน
//   HTTP 200 + "status":"ok"        ปกติ
//   HTTP 200 + "status":"degraded"  ตัวหลักล่ม กำลังใช้ตัวสำรอง (ตั้งเฝ้าคำว่า "ok" เพื่อให้เตือนกรณีนี้ด้วย)
//   HTTP 503 + "status":"down"      ฐานข้อมูลหรือโมเดลใช้ไม่ได้ทั้งหมด

const CACHE_MS = 20_000; // กันคนนอกยิงถี่ ๆ จนเรียกฐานข้อมูล/ผู้ให้บริการโมเดลรัว
let cache: { at: number; result: HealthResult } | null = null;

async function checkDb(): Promise<boolean> {
  try {
    await Promise.race([
      adminDb().collection("settings").doc("commission").get(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 4000)),
    ]);
    return true;
  } catch {
    return false;
  }
}

async function run(): Promise<HealthResult> {
  let primary = false;
  let fallback: boolean | null = null;
  const dbPromise = checkDb();
  try {
    const p = loadProviders();
    const [a, b] = await Promise.all([probeProvider(p.primary), p.fallback ? probeProvider(p.fallback) : null]);
    primary = a;
    fallback = b;
  } catch {
    // ตั้งค่าโมเดลไม่ถูกต้อง นับว่าโมเดลใช้ไม่ได้
  }
  return summarizeHealth({ db: await dbPromise, primary, fallback });
}

export async function GET() {
  if (!cache || Date.now() - cache.at > CACHE_MS) {
    cache = { at: Date.now(), result: await run() };
  }
  const { http, status, checks } = cache.result;
  return Response.json({ status, checks }, { status: http, headers: { "Cache-Control": "no-store" } });
}
