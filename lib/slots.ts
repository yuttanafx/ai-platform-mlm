import { LIMITER_MODE, LLM_TIMEOUT_MS, MAX_CONCURRENT_CHATS } from "@/lib/config";
import { ConcurrencyLimiter } from "@/lib/limiter";
import { acquireSharedSlot } from "@/lib/store";

// ใช้ globalThis เพื่อให้ตัวนับไม่รีเซ็ตเวลา dev server โหลดโค้ดใหม่
const g = globalThis as unknown as { __chatLimiter?: ConcurrencyLimiter };
const local = (g.__chatLimiter ??= new ConcurrencyLimiter(MAX_CONCURRENT_CHATS));

// ขอช่องสร้างคำตอบหนึ่งช่อง คืนฟังก์ชันปล่อยช่อง หรือ null ถ้าเต็ม
// LIMITER_MODE=firestore: นับรวมทุก instance ถ้าติดต่อ Firestore ไม่ได้ จะถอยไปนับในหน่วยความจำ
// (ไม่ปิดบริการเพราะตัวนับพัง แต่ความแม่นยำลดลงเป็นรายเครื่อง)
export async function acquireChatSlot(): Promise<(() => void) | null> {
  if (LIMITER_MODE === "firestore") {
    try {
      // ttl เผื่อเกินเวลาตอบสูงสุด เพื่อให้ช่องที่ instance ดับกลางคันหมดอายุเอง
      const release = await acquireSharedSlot(MAX_CONCURRENT_CHATS, LLM_TIMEOUT_MS + 15_000);
      if (!release) return null;
      let done = false;
      return () => {
        if (done) return;
        done = true;
        void release();
      };
    } catch (e) {
      console.error("shared limiter unavailable, using in-memory:", e instanceof Error ? e.message : e);
    }
  }
  return local.tryAcquire();
}
