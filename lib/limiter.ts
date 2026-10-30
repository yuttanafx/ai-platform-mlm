// ตัวจำกัดจำนวนคำตอบที่กำลังสร้างพร้อมกัน (นับในหน่วยความจำของโปรเซสเดียว)
// รัน Next.js บน VPS เครื่องเดียว = นับครบทุกคำขอ / รันบน Vercel = นับแยกต่อ instance (ค่าโดยประมาณ)

export class ConcurrencyLimiter {
  private active = 0;
  readonly max: number;
  constructor(max: number) {
    this.max = max;
  }

  get inUse() {
    return this.active;
  }

  // คืนฟังก์ชันปล่อยช่อง (เรียกซ้ำกี่ครั้งก็นับครั้งเดียว) หรือ null ถ้าเต็ม
  tryAcquire(): (() => void) | null {
    if (this.active >= this.max) return null;
    this.active++;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active--;
    };
  }
}

// ปล่อยช่องเมื่อสตรีมจบ พัง หรือผู้ใช้ปิดหน้าก่อน
export function withRelease(
  stream: ReadableStream<Uint8Array>,
  release: () => void
): ReadableStream<Uint8Array> {
  const reader = stream.getReader();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          release();
          controller.close();
        } else {
          controller.enqueue(value);
        }
      } catch (e) {
        release();
        controller.error(e);
      }
    },
    async cancel(reason) {
      release();
      await reader.cancel(reason).catch(() => {});
    },
  });
}

// อ่านค่าจำนวนเต็มบวกจากตัวแปรสภาพแวดล้อม ค่าที่ผิดรูปแบบใช้ค่าเริ่มต้น
export function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return raw && Number.isInteger(n) && n >= 1 ? n : fallback;
}

// ---------- ตัวนับกลาง (ใช้กับ Firestore เมื่อรันหลาย instance เช่น Vercel) ----------
// เก็บช่องที่ถูกใช้อยู่เป็น { รหัสช่อง: เวลาหมดอายุ (ms) } ในเอกสารเดียว
// ช่องมีอายุจำกัด ถ้า instance ใดดับกลางคันโดยไม่ได้ปล่อยช่อง ช่องนั้นจะหมดอายุเองและไม่ค้างตลอดไป

export type Slots = Record<string, number>;

export function tryAddSlot(
  slots: Slots,
  id: string,
  now: number,
  max: number,
  ttlMs: number
): { ok: boolean; slots: Slots; pruned: boolean } {
  const live: Slots = {};
  let pruned = false;
  for (const [k, exp] of Object.entries(slots)) {
    if (exp > now) live[k] = exp;
    else pruned = true;
  }
  if (Object.keys(live).length >= max) return { ok: false, slots: live, pruned };
  live[id] = now + ttlMs;
  return { ok: true, slots: live, pruned };
}
