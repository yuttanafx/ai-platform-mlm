// สรุปผลตรวจสุขภาพระบบ เป็นฟังก์ชันล้วน ๆ ทดสอบแยกได้
// status: ok = ปกติ / degraded = ใช้งานได้แต่ตัวหลักล่ม กำลังใช้ตัวสำรอง / down = ตอบสมาชิกไม่ได้
export type HealthInput = {
  db: boolean;
  primary: boolean;
  fallback: boolean | null; // null = ไม่ได้ตั้งตัวสำรอง
};

export type HealthResult = {
  status: "ok" | "degraded" | "down";
  http: 200 | 503;
  checks: { db: "ok" | "down"; model: "ok" | "fallback" | "down" };
};

export function summarizeHealth(i: HealthInput): HealthResult {
  const model: HealthResult["checks"]["model"] = i.primary ? "ok" : i.fallback === true ? "fallback" : "down";
  const db: HealthResult["checks"]["db"] = i.db ? "ok" : "down";
  if (db === "down" || model === "down") return { status: "down", http: 503, checks: { db, model } };
  if (model === "fallback") return { status: "degraded", http: 200, checks: { db, model } };
  return { status: "ok", http: 200, checks: { db, model } };
}
