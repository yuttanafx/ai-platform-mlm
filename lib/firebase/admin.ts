import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// ใช้ service account: ข้ามกฎความปลอดภัยของ Firestore ได้ ห้ามเรียกจากโค้ดฝั่งเบราว์เซอร์เด็ดขาด
// วางได้ 2 แบบ: (ก) ช่องเดียว FIREBASE_SERVICE_ACCOUNT = เนื้อไฟล์ JSON ทั้งก้อน (หรือ base64 ของมัน)
//              (ข) แยก 3 ช่อง FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY
function credentials() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT?.trim();
  if (raw) {
    const text = raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
    let j: { project_id?: string; client_email?: string; private_key?: string };
    try {
      j = JSON.parse(text);
    } catch {
      throw new Error("FIREBASE_SERVICE_ACCOUNT ต้องเป็นเนื้อไฟล์ JSON ของ service account ทั้งก้อน");
    }
    if (!j.project_id || !j.client_email || !j.private_key) {
      throw new Error("FIREBASE_SERVICE_ACCOUNT ขาด project_id / client_email / private_key");
    }
    return {
      projectId: j.project_id,
      clientEmail: j.client_email,
      privateKey: j.private_key.replace(/\\n/g, "\n"),
    };
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.trim()
    .replace(/^["']|["']$/g, "")
    .replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("ยังไม่ได้ตั้งค่า FIREBASE_SERVICE_ACCOUNT (หรือ FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY)");
  }
  return { projectId, clientEmail, privateKey };
}

function app(): App {
  const existing = getApps()[0];
  if (existing) return existing;
  return initializeApp({ credential: cert(credentials()) });
}

// ใช้เป็นวัตถุดิบสร้างกุญแจเซ็นคุกกี้เซสชัน เมื่อไม่ได้ตั้ง SESSION_SECRET แยก
export const signingMaterial = () => credentials().privateKey;
export const adminDb = () => getFirestore(app());
