import { parsePositiveInt } from "@/lib/limiter";

// ไฟล์นี้รวมค่าที่ปรับบ่อยที่สุด แก้ที่นี่ที่เดียวแล้วทั้งแพลตฟอร์มเปลี่ยนตาม

export const APP_NAME = "TerraVoltec AI";

export const APP_TAGLINE = "ถามอะไรก็ได้ ตอบเป็นภาษาไทยหรือภาษาอื่นตามที่คุณใช้";

// ข้อความที่แสดงเป็นปุ่มลัดในหน้าแรก
export const SUGGESTIONS = [
  "ช่วยสรุปบทความยาว ๆ ให้เหลือ 5 ข้อ",
  "ช่วยร่างอีเมลตอบลูกค้าที่ไม่พอใจ",
  "อธิบายแนวคิดนี้ให้เด็กมัธยมเข้าใจ",
];

// กำหนดบทบาทและนิสัยของผู้ช่วย นี่คือส่วนที่ทำให้แพลตฟอร์มของคุณเป็นของคุณ
export const SYSTEM_PROMPT = `คุณคือ "${APP_NAME}" ผู้ช่วยที่ตอบตรงประเด็น สุภาพ และเป็นกันเอง
- ตอบเป็นภาษาเดียวกับที่ผู้ใช้พิมพ์มา
- ถ้าไม่แน่ใจ ให้บอกตรง ๆ ว่าไม่แน่ใจ อย่าเดาข้อมูล
- ถ้าคำถามกำกวม ให้ถามกลับสั้น ๆ หนึ่งข้อ
- ใช้ลิสต์หรือตารางเมื่อช่วยให้อ่านง่ายขึ้นเท่านั้น`;

// ---------- การเชื่อมต่อโมเดล ----------
// ตัวแปรสภาพแวดล้อมที่ใช้ (อ่านใน lib/llm.ts):
//   LLM_PROVIDER           ตัวหลัก: ollama (ค่าเริ่มต้น) หรือ openai
//   LLM_FALLBACK_PROVIDER  ตัวสำรอง (ไม่บังคับ) ต้องต่างจากตัวหลัก
//   OLLAMA_BASE_URL / OLLAMA_MODEL / OLLAMA_API_KEY
//   OPENAI_BASE_URL / OPENAI_MODEL / OPENAI_API_KEY / OPENAI_MAX_TOKENS_PARAM

// รอให้โมเดลตัวหลักเริ่มตอบได้นานสุดกี่มิลลิวินาที ก่อนสลับไปตัวสำรอง (มีผลเมื่อตั้งตัวสำรองไว้)
export const LLM_FIRST_BYTE_MS = 25_000;

// เวลาทั้งหมดต่อหนึ่งคำตอบ (มิลลิวินาที) ต้องไม่เกิน maxDuration ของ route
export const LLM_TIMEOUT_MS = 55_000;

// จำนวนคำตอบที่สร้างพร้อมกันได้สูงสุด เกินแล้วตอบ "คนใช้เยอะ" แทนการให้ทุกคนรอจนหมดเวลา
// ตั้งตามที่ทดสอบจริงว่าโมเดล/แผน API รับได้ ตัวแปรสภาพแวดล้อม MAX_CONCURRENT_CHATS (ค่าเริ่มต้น 8)
export const MAX_CONCURRENT_CHATS = parsePositiveInt(process.env.MAX_CONCURRENT_CHATS, 8);

// วิธีนับคำขอพร้อมกัน: "memory" (ค่าเริ่มต้น นับในโปรเซสเดียว เหมาะกับ VPS เครื่องเดียว)
// หรือ "firestore" (นับรวมทุก instance เหมาะกับ Vercel หรือรันหลายเครื่อง แลกกับการอ่าน/เขียน Firestore เพิ่มต่อข้อความ)
export const LIMITER_MODE: "memory" | "firestore" =
  process.env.LIMITER_MODE === "firestore" ? "firestore" : "memory";

// ความยาวคำตอบสูงสุด (หน่วยเป็น token)
export const MAX_TOKENS = 2048;

// จำกัดจำนวนข้อความย้อนหลังที่ส่งให้โมเดล เพื่อคุมค่าใช้จ่าย
export const MAX_HISTORY = 30;

// จำกัดความยาวต่อข้อความ (ตัวอักษร) กันคนส่งข้อความยักษ์
export const MAX_MESSAGE_CHARS = 8000;

// ---------- แพ็กเกจและโควตา ----------

export const PLAN_NAME = "แพ็กเกจรายเดือน";

// ราคาเป็นสตางค์ (29900 = 299 บาท)
export const PLAN_PRICE_SATANG = 29900;

// ชำระครั้งเดียวต่ออายุได้กี่วัน
export const PLAN_DAYS = 30;

// จำนวนข้อความต่อวันต่อผู้ใช้ ช่วยคุมต้นทุน API
export const DAILY_MESSAGE_LIMIT = 100;
