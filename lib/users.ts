import { randomBytes } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { hashPassword, newToken, sha256Hex } from "@/lib/security";

// โครงข้อมูลระบบสมาชิก (Firestore ผ่าน Admin SDK เท่านั้น)
//   users/{uid}           อีเมล, รหัสผ่าน (scrypt), emailVerified, disabled, tokenVersion
//   emailIndex/{sha256}   อีเมล -> uid (ประกันว่าอีเมลไม่ซ้ำ)
//   authTokens/{sha256}   โทเคนยืนยันอีเมล / ตั้งรหัสผ่านใหม่ (เก็บเฉพาะค่าแฮช)
//   loginAttempts/{sha256} จำนวนครั้งที่ล็อกอินพลาด

const col = (name: string) => adminDb().collection(name);
const emailKey = (email: string) => sha256Hex(email);

export type UserRecord = {
  uid: string;
  email: string;
  passwordHash: string;
  emailVerified: boolean;
  disabled: boolean;
  tokenVersion: number;
  lastMailAt: number | null;
};

function toRecord(uid: string, d: FirebaseFirestore.DocumentData): UserRecord {
  return {
    uid,
    email: d.email,
    passwordHash: d.passwordHash,
    emailVerified: d.emailVerified === true,
    disabled: d.disabled === true,
    tokenVersion: Number(d.tokenVersion ?? 0),
    lastMailAt: d.lastMailAt instanceof Timestamp ? d.lastMailAt.toMillis() : null,
  };
}

export async function getUser(uid: string): Promise<UserRecord | null> {
  const snap = await col("users").doc(uid).get();
  return snap.exists ? toRecord(uid, snap.data()!) : null;
}

export async function findUserByEmail(email: string): Promise<UserRecord | null> {
  const idx = await col("emailIndex").doc(emailKey(email)).get();
  if (!idx.exists) return null;
  return getUser(idx.data()!.uid as string);
}

export class EmailTakenError extends Error {}

export async function createUser(email: string, password: string, emailVerified: boolean): Promise<string> {
  const passwordHash = await hashPassword(password);
  const uid = randomBytes(12).toString("hex");
  const idxRef = col("emailIndex").doc(emailKey(email));
  const userRef = col("users").doc(uid);
  await adminDb().runTransaction(async (tx) => {
    if ((await tx.get(idxRef)).exists) throw new EmailTakenError();
    tx.set(idxRef, { uid });
    tx.set(userRef, {
      email,
      passwordHash,
      emailVerified,
      disabled: false,
      tokenVersion: 0,
      createdAt: Timestamp.now(),
    });
  });
  return uid;
}

export async function setPassword(uid: string, password: string): Promise<void> {
  const passwordHash = await hashPassword(password);
  await col("users").doc(uid).update({
    passwordHash,
    emailVerified: true, // เปิดลิงก์จากอีเมลได้ = เป็นเจ้าของอีเมลจริง
    tokenVersion: FieldValue.increment(1), // ตัดเซสชันเก่าทั้งหมด
  });
}

export async function markVerified(uid: string): Promise<void> {
  await col("users").doc(uid).update({ emailVerified: true });
}

export async function touchMail(uid: string): Promise<void> {
  await col("users").doc(uid).update({ lastMailAt: Timestamp.now() });
}

// ---------- โทเคนในลิงก์อีเมล ----------

export type TokenType = "verify" | "reset";

export async function createToken(uid: string, type: TokenType, ttlMs: number): Promise<string> {
  const raw = newToken();
  await col("authTokens")
    .doc(sha256Hex(raw))
    .set({ uid, type, expiresAt: Timestamp.fromMillis(Date.now() + ttlMs) });
  return raw;
}

// เช็กโทเคน ถ้า consume = true จะลบทิ้ง (ใช้ได้ครั้งเดียว)
export async function readToken(raw: string, type: TokenType, consume: boolean): Promise<string | null> {
  if (!raw || raw.length > 200) return null;
  const ref = col("authTokens").doc(sha256Hex(raw));
  return adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const d = snap.data()!;
    const expired = !(d.expiresAt instanceof Timestamp) || d.expiresAt.toMillis() < Date.now();
    if (d.type !== type || expired) {
      if (expired) tx.delete(ref);
      return null;
    }
    if (consume) tx.delete(ref);
    return d.uid as string;
  });
}

// ---------- กันเดารหัสผ่าน ----------

const MAX_FAILS = 8;
const WINDOW_MS = 15 * 60 * 1000;

export async function isThrottled(email: string): Promise<boolean> {
  const snap = await col("loginAttempts").doc(emailKey(email)).get();
  if (!snap.exists) return false;
  const d = snap.data()!;
  const resetAt = d.resetAt instanceof Timestamp ? d.resetAt.toMillis() : 0;
  return resetAt > Date.now() && Number(d.count ?? 0) >= MAX_FAILS;
}

export async function recordFailure(email: string): Promise<void> {
  const ref = col("loginAttempts").doc(emailKey(email));
  await adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const now = Date.now();
    const d = snap.data();
    const resetAt = d?.resetAt instanceof Timestamp ? d.resetAt.toMillis() : 0;
    if (!d || resetAt <= now) {
      tx.set(ref, { count: 1, resetAt: Timestamp.fromMillis(now + WINDOW_MS) });
    } else {
      tx.update(ref, { count: Number(d.count ?? 0) + 1 });
    }
  });
}

export async function clearFailures(email: string): Promise<void> {
  await col("loginAttempts").doc(emailKey(email)).delete().catch(() => {});
}

// ---------- พัก/ปลดพักบัญชี ----------

export async function setDisabled(uid: string, disabled: boolean): Promise<void> {
  await col("users").doc(uid).set(
    disabled ? { disabled: true, tokenVersion: FieldValue.increment(1) } : { disabled: false },
    { merge: true }
  );
}
