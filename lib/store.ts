import { randomBytes } from "node:crypto";
import { FieldValue, Timestamp, type Query } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { setDisabled } from "@/lib/users";
import { parseReferrerCode } from "@/lib/referral";
import {
  LEVELS,
  bangkokMonth,
  parseSettings,
  pvOf,
  planPayment,
  reverseStatus,
  type CommissionSettings,
  type LedgerStatus,
} from "@/lib/commission";

// โครงข้อมูลใน Firestore (เข้าถึงผ่าน Admin SDK ที่เซิร์ฟเวอร์เท่านั้น)
//   profiles/{uid}                 โปรไฟล์สมาชิก
//   referralCodes/{code}           ดัชนีรหัสแนะนำ -> uid (ใช้ประกันว่ารหัสไม่ซ้ำ)
//   payments/{provider}_{payId}    การชำระเงิน (id ซ้ำไม่ได้ = จ่ายซ้ำไม่ได้)
//   commissionLedger/{payId}_{lv}  สมุดบัญชีคอมมิชชั่น แถวละชั้น
//   usageDaily/{uid}_{YYYY-MM-DD}  จำนวนข้อความต่อวัน
//   settings/commission            อัตราคอมมิชชั่น (ไม่มี = ใช้ค่าเริ่มต้น)
//   teamPv/{uid}_{YYYY-MM}         PV ทีมของสมาชิกในเดือนนั้น (จากค่าบริการที่สายล่างจ่ายจริง)

const col = (name: string) => adminDb().collection(name);

const toDate = (v: unknown): Date | null => (v instanceof Timestamp ? v.toDate() : null);

export type Profile = {
  email: string | null;
  referralCode: string;
  referrerId: string | null;
  paidUntil: Date | null;
  downline: number[]; // จำนวนสมาชิกชั้น 1..6
};

export async function getProfile(uid: string): Promise<Profile | null> {
  const snap = await col("profiles").doc(uid).get();
  if (!snap.exists) return null;
  const d = snap.data()!;
  const counts: Record<string, number> = d.downline ?? {};
  return {
    email: d.email ?? null,
    referralCode: d.referralCode,
    referrerId: d.referrerId ?? null,
    paidUntil: toDate(d.paidUntil),
    downline: Array.from({ length: LEVELS }, (_, i) => Number(counts[`l${i + 1}`] ?? 0)),
  };
}

export function isActive(p: Profile | null): boolean {
  return !!p?.paidUntil && p.paidUntil > new Date();
}

// ===== สร้างโปรไฟล์ (เรียกครั้งแรกตอนสมัคร เรียกซ้ำไม่มีผล) =====
// ผู้แนะนำกำหนดตอนสร้างเท่านั้น ไม่มีโค้ดส่วนไหนแก้ได้ภายหลัง
// เก็บสายบน (upline) ไว้ในโปรไฟล์ จึงแบ่งคอมมิชชั่นได้โดยอ่านเอกสารเดียว

const CODE_RE = /^[A-Z0-9]{4,16}$/;

export async function ensureProfile(
  uid: string,
  email: string | null,
  referralInput?: string
): Promise<void> {
  const db = adminDb();
  const profileRef = col("profiles").doc(uid);
  const input = (referralInput ?? "").trim().toUpperCase();
  const inputRef = CODE_RE.test(input) ? col("referralCodes").doc(input) : null;

  // รหัสสุ่มอาจชนกัน (โอกาสน้อยมาก) ลองใหม่ได้ไม่เกิน 5 ครั้ง
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomBytes(4).toString("hex").toUpperCase();
    const codeRef = col("referralCodes").doc(code);

    const done = await db.runTransaction(async (tx) => {
      const [existing, codeSnap, inputSnap] = await Promise.all([
        tx.get(profileRef),
        tx.get(codeRef),
        inputRef ? tx.get(inputRef) : Promise.resolve(null),
      ]);
      if (existing.exists) return true;
      if (codeSnap.exists) return false;

      const referrerId: string | null = inputSnap?.exists ? inputSnap.data()!.uid : null;
      let upline: string[] = [];
      if (referrerId) {
        const refProfile = await tx.get(col("profiles").doc(referrerId));
        const above: string[] = refProfile.get("upline") ?? [];
        upline = [referrerId, ...above].slice(0, LEVELS);
      }

      tx.set(codeRef, { uid });
      tx.set(profileRef, {
        email,
        referralCode: code,
        referrerId,
        upline,
        downline: {},
        paidUntil: null,
        createdAt: Timestamp.now(),
      });
      // นับสมาชิกในสายของแต่ละชั้นให้ผู้แนะนำทุกคนข้างบน
      upline.forEach((id, i) => {
        tx.update(col("profiles").doc(id), { [`downline.l${i + 1}`]: FieldValue.increment(1) });
      });
      return true;
    });
    if (done) return;
  }
  throw new Error("สร้างรหัสแนะนำไม่สำเร็จ ลองใหม่อีกครั้ง");
}

// ===== บันทึกการชำระเงิน + แบ่งคอมมิชชั่น (ธุรกรรมเดียว) =====
// เรียกซ้ำด้วย payment id เดิมได้ ไม่จ่ายซ้ำ (คืน false)

export async function recordPayment(p: {
  userId: string;
  provider: string;
  providerPaymentId: string;
  amountSatang: number;
  days: number;
}): Promise<boolean> {
  const paymentId = `${p.provider}_${p.providerPaymentId}`;
  const paymentRef = col("payments").doc(paymentId);
  const profileRef = col("profiles").doc(p.userId);
  const settingsRef = col("settings").doc("commission");

  return adminDb().runTransaction(async (tx) => {
    const [pay, prof, set] = await Promise.all([
      tx.get(paymentRef),
      tx.get(profileRef),
      tx.get(settingsRef),
    ]);
    if (pay.exists) return false;
    if (!prof.exists) throw new Error(`ไม่พบโปรไฟล์ ${p.userId}`);

    const now = new Date();
    const settings = parseSettings(set.exists ? set.data() : undefined);
    const upline: string[] = prof.get("upline") ?? [];
    const month = bangkokMonth(now);
    const pv = pvOf(p.amountSatang, settings.pvPerBaht);

    // อ่านโปรไฟล์ (เช็คแพ็กเกจ) และ PV ทีมเดือนนี้ของสายบนทุกคนก่อนเขียนอะไร (ข้อกำหนดของ Firestore transaction)
    const pvRefs = upline.map((id) => col("teamPv").doc(`${id}_${month}`));
    const extra = upline.length
      ? await tx.getAll(...upline.map((id) => col("profiles").doc(id)), ...pvRefs)
      : [];
    const uplineStats = upline.map((_, i) => {
      const until = extra[i]?.exists ? toDate(extra[i].get("paidUntil")) : null;
      return {
        active: !!until && until > now,
        teamPv: Number(extra[upline.length + i]?.get("pv") ?? 0) + pv,
      };
    });

    const plan = planPayment({
      amountSatang: p.amountSatang,
      days: p.days,
      now,
      currentPaidUntil: toDate(prof.get("paidUntil")),
      upline,
      uplineStats,
      settings,
    });

    tx.set(paymentRef, {
      userId: p.userId,
      provider: p.provider,
      providerPaymentId: p.providerPaymentId,
      amountSatang: p.amountSatang,
      status: "succeeded",
      pv,
      pvMonth: month,
      upline,
      createdAt: Timestamp.fromDate(now),
    });
    tx.update(profileRef, { paidUntil: Timestamp.fromDate(plan.paidUntil) });
    for (const id of upline) {
      tx.set(
        col("teamPv").doc(`${id}_${month}`),
        { uid: id, month, pv: FieldValue.increment(pv) },
        { merge: true }
      );
    }
    for (const l of plan.ledger) {
      tx.set(col("commissionLedger").doc(`${paymentId}_${l.level}`), {
        paymentId,
        beneficiaryId: l.beneficiaryId,
        intendedBeneficiaryId: l.intendedBeneficiaryId,
        rank: l.rank,
        reason: l.reason,
        level: l.level,
        amountSatang: l.amountSatang,
        pv: l.pv,
        status: "held",
        availableAt: Timestamp.fromDate(l.availableAt),
        paidAt: null,
        rateSnapshot: l.rateSnapshot,
        createdAt: Timestamp.fromDate(now),
      });
    }
    return true;
  });
}

// ===== คืนเงิน: ยกเลิกคอมมิชชั่นที่ยังไม่จ่าย / ทำเครื่องหมายเรียกคืนที่จ่ายไปแล้ว =====

export async function reversePayment(provider: string, providerPaymentId: string): Promise<boolean> {
  const paymentId = `${provider}_${providerPaymentId}`;
  const paymentRef = col("payments").doc(paymentId);
  const ledgerRefs = Array.from({ length: LEVELS }, (_, i) =>
    col("commissionLedger").doc(`${paymentId}_${i + 1}`)
  );

  return adminDb().runTransaction(async (tx) => {
    const pay = await tx.get(paymentRef);
    if (!pay.exists || pay.get("status") !== "succeeded") return false;
    const rows = await tx.getAll(...ledgerRefs);

    tx.update(paymentRef, { status: "refunded" });
    // คืน PV ทีมที่เคยนับจากการชำระครั้งนี้ (รายการเก่าที่ไม่มีข้อมูล pv ข้ามไป)
    const pv = Number(pay.get("pv") ?? 0);
    const pvMonth = pay.get("pvMonth");
    if (pv > 0 && typeof pvMonth === "string") {
      for (const id of (pay.get("upline") ?? []) as string[]) {
        tx.set(col("teamPv").doc(`${id}_${pvMonth}`), { pv: FieldValue.increment(-pv) }, { merge: true });
      }
    }
    for (const row of rows) {
      if (!row.exists) continue;
      const current = row.get("status") as LedgerStatus;
      const next = reverseStatus(current);
      if (next !== current) tx.update(row.ref, { status: next });
    }
    // ตัดสิทธิ์ใช้งานทันที
    tx.update(col("profiles").doc(pay.get("userId")), { paidUntil: Timestamp.now() });
    return true;
  });
}

// ===== โควตาข้อความรายวัน (นับตามวันของไทย) =====

const bangkokDay = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date()); // YYYY-MM-DD

// คืน true ถ้ายังไม่เกินโควตา (นับเพิ่มทุกครั้งที่เรียก)
export async function bumpUsage(uid: string, limit: number): Promise<boolean> {
  const ref = col("usageDaily").doc(`${uid}_${bangkokDay()}`);
  return adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const count = Number(snap.get("count") ?? 0) + 1;
    tx.set(ref, { userId: uid, day: bangkokDay(), count });
    return count <= limit;
  });
}

// ===== หน้าคอมมิชชั่น =====

export type LedgerRow = {
  level: number;
  amountSatang: number;
  pv: number | null;
  status: LedgerStatus;
  availableAt: Date;
};

export async function getLedger(uid: string): Promise<LedgerRow[]> {
  const snap = await col("commissionLedger").where("beneficiaryId", "==", uid).get();
  return snap.docs.map((d) => ({
    level: d.get("level"),
    amountSatang: d.get("amountSatang"),
    pv: d.get("pv") ?? null, // แถวเก่าที่ยังไม่มี pv ให้หน้าจอคำนวณจากอัตราปัจจุบัน
    status: d.get("status"),
    availableAt: toDate(d.get("availableAt")) ?? new Date(0),
  }));
}

// ===== แอดมิน: รายชื่อสมาชิก + พักบัญชี =====

export type MemberRow = {
  uid: string;
  email: string | null;
  referralCode: string;
  referrerEmail: string | null;
  directReferrals: number;
  paidUntil: Date | null;
  createdAt: Date;
  suspended: boolean;
  suspendedReason: string | null;
};

// เรียงจากสมัครล่าสุด แบ่งหน้าด้วย after (millis ของ createdAt ของแถวสุดท้ายในหน้าก่อน)
// ถ้าใส่ q = ค้นหาด้วยอีเมลที่ตรงทั้งหมด
export async function listMembers(opts: { q?: string; after?: number; limit?: number }) {
  const limit = opts.limit ?? 50;
  const q = opts.q?.trim().toLowerCase();

  let query: Query = q
    ? col("profiles").where("email", "==", q)
    : col("profiles").orderBy("createdAt", "desc");
  if (!q && opts.after) query = query.startAfter(Timestamp.fromMillis(opts.after));
  const snap = await query.limit(limit + 1).get();

  const docs = snap.docs.slice(0, limit);
  const hasMore = snap.docs.length > limit;

  // หาอีเมลของผู้แนะนำทีเดียว
  const refIds = [...new Set(docs.map((d) => d.get("referrerId")).filter(Boolean) as string[])];
  const refEmails = new Map<string, string | null>();
  if (refIds.length) {
    const refSnaps = await adminDb().getAll(...refIds.map((id) => col("profiles").doc(id)));
    refSnaps.forEach((r) => refEmails.set(r.id, r.get("email") ?? null));
  }

  const rows: MemberRow[] = docs.map((d) => ({
    uid: d.id,
    email: d.get("email") ?? null,
    referralCode: d.get("referralCode"),
    referrerEmail: d.get("referrerId") ? (refEmails.get(d.get("referrerId")) ?? null) : null,
    directReferrals: Number(d.get("downline.l1") ?? 0),
    paidUntil: toDate(d.get("paidUntil")),
    createdAt: toDate(d.get("createdAt")) ?? new Date(0),
    suspended: d.get("suspended") === true,
    suspendedReason: d.get("suspendedReason") ?? null,
  }));

  const total = q ? rows.length : (await col("profiles").count().get()).data().count;
  const last = rows[rows.length - 1];
  return { rows, total, nextAfter: hasMore && last ? last.createdAt.getTime() : null };
}

// พักบัญชี: ปิดบัญชี (ล็อกอินไม่ได้) + เพิกถอนเซสชันทั้งหมดทันที
// ตัวกั้นจริงคือ getSessionUser ซึ่งตรวจ disabled/tokenVersion ทุกคำขอ
// ยอดคอมมิชชั่นของสมาชิกที่ถูกพักไม่ถูกแตะ ให้แอดมินตัดสินใจเอง
export async function setSuspended(
  uid: string,
  suspended: boolean,
  reason: string,
  by: { uid: string; email: string | null }
) {
  await setDisabled(uid, suspended);

  await col("profiles")
    .doc(uid)
    .update(
      suspended
        ? { suspended: true, suspendedAt: Timestamp.now(), suspendedReason: reason || null }
        : { suspended: false, suspendedAt: null, suspendedReason: null }
    );

  await col("adminLog").add({
    action: suspended ? "suspend" : "unsuspend",
    targetUid: uid,
    reason: reason || null,
    adminUid: by.uid,
    adminEmail: by.email,
    at: Timestamp.now(),
  });
}

// อ่านอัตราที่ใช้อยู่ (ไม่มีเอกสาร = ค่าเริ่มต้น)
export async function getCommissionSettings(): Promise<CommissionSettings> {
  const snap = await col("settings").doc("commission").get();
  return parseSettings(snap.exists ? snap.data() : undefined);
}

// บันทึกอัตราใหม่ มีผลกับการชำระเงินครั้งถัดไปเท่านั้น รายการเก่าเก็บอัตราของตัวเองไว้ใน rateSnapshot แล้ว
export async function saveCommissionSettings(
  next: CommissionSettings,
  by: { uid: string; email: string | null }
) {
  const ref = col("settings").doc("commission");
  const before = await getCommissionSettings().catch(() => null);
  await ref.set({ ...next, updatedAt: Timestamp.now(), updatedBy: by.email });
  await col("adminLog").add({
    action: "update_commission_settings",
    before,
    after: next,
    adminUid: by.uid,
    adminEmail: by.email,
    at: Timestamp.now(),
  });
}

// PV ทีมของเดือนนี้ (เวลาไทย) ใช้แสดงยศในแดชบอร์ด
export async function getTeamPv(uid: string): Promise<number> {
  const snap = await col("teamPv").doc(`${uid}_${bangkokMonth(new Date())}`).get();
  return Math.max(0, Number(snap.get("pv") ?? 0));
}

// ===== ผู้แนะนำ: ผูกภายหลังได้ครั้งเดียว (ตอนแอดมินอนุมัติการชำระเงินครั้งแรก) =====
// ผูกได้เฉพาะสมาชิกที่ยังไม่มีผู้แนะนำ ไม่เคยชำระเงิน และยังไม่มีสายล่าง
// (ถ้ามีสายล่าง ต้องไล่แก้สายบนของทุกคนข้างล่าง จึงไม่อนุญาต)

export function canBindReferrer(p: Profile | null): boolean {
  return !!p && !p.referrerId && !p.paidUntil && (p.downline[0] ?? 0) === 0;
}

export async function lookupReferrer(
  input: string
): Promise<{ uid: string; email: string | null; code: string } | null> {
  const code = parseReferrerCode(input);
  if (!code) return null;
  const idx = await col("referralCodes").doc(code).get();
  if (!idx.exists) return null;
  const uid = idx.data()!.uid as string;
  const prof = await col("profiles").doc(uid).get();
  if (!prof.exists) return null;
  return { uid, email: (prof.get("email") as string | null) ?? null, code };
}

export type BindResult = "bound" | "already" | "not_allowed" | "invalid";

export async function bindReferrerIfNone(uid: string, input: string): Promise<BindResult> {
  const code = parseReferrerCode(input);
  if (!code) return "invalid";
  return adminDb().runTransaction(async (tx): Promise<BindResult> => {
    const profRef = col("profiles").doc(uid);
    const [prof, codeSnap] = await Promise.all([tx.get(profRef), tx.get(col("referralCodes").doc(code))]);
    if (!prof.exists) return "invalid";
    if (prof.get("referrerId")) return "already";
    if (!codeSnap.exists) return "invalid";
    const referrerId = codeSnap.data()!.uid as string;
    if (referrerId === uid) return "invalid";
    if (prof.get("paidUntil") != null || Number(prof.get("downline.l1") ?? 0) > 0) return "not_allowed";

    const refProf = await tx.get(col("profiles").doc(referrerId));
    if (!refProf.exists) return "invalid";
    const above: string[] = refProf.get("upline") ?? [];
    if (above.includes(uid)) return "not_allowed"; // กันสายวนกลับ

    const upline = [referrerId, ...above].slice(0, LEVELS);
    tx.update(profRef, { referrerId, upline });
    upline.forEach((id, i) => {
      tx.update(col("profiles").doc(id), { [`downline.l${i + 1}`]: FieldValue.increment(1) });
    });
    return "bound";
  });
}

// ===== ช่องทางรับชำระ (ข้อความที่แอดมินกรอก สมาชิกเห็นในหน้าแพ็กเกจ) =====

export const PAYMENT_INSTRUCTIONS_MAX = 2000;

export async function getPaymentInstructions(): Promise<string> {
  const snap = await col("settings").doc("payment").get();
  return snap.exists ? String(snap.get("instructions") ?? "") : "";
}

export async function savePaymentInstructions(text: string, by: { uid: string; email: string | null }) {
  const before = await getPaymentInstructions();
  await col("settings").doc("payment").set({ instructions: text, updatedAt: Timestamp.now(), updatedBy: by.email });
  await col("adminLog").add({
    action: "update_payment_instructions",
    before,
    after: text,
    adminUid: by.uid,
    adminEmail: by.email,
    at: Timestamp.now(),
  });
}

// ===== แจ้งชำระเงินแบบโอนเอง (แอดมินตรวจแล้วอนุมัติ) =====
// paymentRequests/{id}  สมาชิกแจ้ง: ช่องทางที่ชำระ, บัญชี/หมายเหตุ, รหัสผู้แนะนำ
// อนุมัติ = (ผูกผู้แนะนำถ้าเข้าเงื่อนไข) + recordPayment provider "manual" จึงต่ออายุ + คิด PV/คอมมิชชั่นเหมือน Stripe ทุกอย่าง

export type PaymentRequest = {
  id: string;
  uid: string;
  email: string | null;
  channel: string;
  note: string;
  referrerInput: string;
  referrerCode: string | null;
  amountSatang: number;
  days: number;
  status: "pending" | "approved" | "rejected";
  createdAt: Date;
  resolvedAt: Date | null;
  rejectReason: string | null;
};

function toRequest(id: string, d: FirebaseFirestore.DocumentData): PaymentRequest {
  return {
    id,
    uid: d.uid,
    email: d.email ?? null,
    channel: d.channel ?? "",
    note: d.note ?? "",
    referrerInput: d.referrerInput ?? "",
    referrerCode: d.referrerCode ?? null,
    amountSatang: Number(d.amountSatang ?? 0),
    days: Number(d.days ?? 0),
    status: d.status,
    createdAt: toDate(d.createdAt) ?? new Date(0),
    resolvedAt: toDate(d.resolvedAt),
    rejectReason: d.rejectReason ?? null,
  };
}

export class PendingRequestError extends Error {}

export async function createPaymentRequest(p: {
  uid: string;
  email: string | null;
  channel: string;
  note: string;
  referrerInput: string;
  referrerCode: string | null;
  amountSatang: number;
  days: number;
}): Promise<string> {
  const pending = await col("paymentRequests")
    .where("uid", "==", p.uid)
    .where("status", "==", "pending")
    .limit(1)
    .get();
  if (!pending.empty) throw new PendingRequestError();
  const ref = await col("paymentRequests").add({
    ...p,
    status: "pending",
    createdAt: Timestamp.now(),
    resolvedAt: null,
    rejectReason: null,
  });
  return ref.id;
}

export async function listMyRequests(uid: string): Promise<PaymentRequest[]> {
  const snap = await col("paymentRequests").where("uid", "==", uid).limit(30).get();
  return snap.docs
    .map((d) => toRequest(d.id, d.data()))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 10);
}

export async function listPendingRequests(): Promise<PaymentRequest[]> {
  const snap = await col("paymentRequests").where("status", "==", "pending").limit(100).get();
  return snap.docs
    .map((d) => toRequest(d.id, d.data()))
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

export type ResolveResult = "ok" | "not_found" | "not_pending";

export async function approvePaymentRequest(
  id: string,
  by: { uid: string; email: string | null }
): Promise<ResolveResult> {
  const ref = col("paymentRequests").doc(id);
  const snap = await ref.get();
  if (!snap.exists) return "not_found";
  const r = toRequest(id, snap.data()!);
  if (r.status !== "pending") return "not_pending";

  // ผูกผู้แนะนำก่อนคิดคอมมิชชั่น (ไม่เข้าเงื่อนไขก็ข้าม ไม่ทำให้การอนุมัติล้ม)
  let referrerResult: BindResult | "none" = "none";
  if (r.referrerCode) referrerResult = await bindReferrerIfNone(r.uid, r.referrerCode);

  // payment id = manual_{id} เรียกซ้ำได้ไม่จ่ายซ้ำ (ถ้าขั้นถัดไปพัง กดอนุมัติใหม่ได้)
  await recordPayment({
    userId: r.uid,
    provider: "manual",
    providerPaymentId: id,
    amountSatang: r.amountSatang,
    days: r.days,
  });

  await ref.update({
    status: "approved",
    resolvedAt: Timestamp.now(),
    resolvedBy: by.email,
    referrerResult,
  });
  await col("adminLog").add({
    action: "approve_payment_request",
    requestId: id,
    targetUid: r.uid,
    amountSatang: r.amountSatang,
    referrerResult,
    adminUid: by.uid,
    adminEmail: by.email,
    at: Timestamp.now(),
  });
  return "ok";
}

export async function rejectPaymentRequest(
  id: string,
  reason: string,
  by: { uid: string; email: string | null }
): Promise<ResolveResult> {
  const ref = col("paymentRequests").doc(id);
  const result = await adminDb().runTransaction(async (tx): Promise<ResolveResult> => {
    const snap = await tx.get(ref);
    if (!snap.exists) return "not_found";
    if (snap.get("status") !== "pending") return "not_pending";
    tx.update(ref, {
      status: "rejected",
      resolvedAt: Timestamp.now(),
      resolvedBy: by.email,
      rejectReason: reason || null,
    });
    return "ok";
  });
  if (result === "ok") {
    await col("adminLog").add({
      action: "reject_payment_request",
      requestId: id,
      reason: reason || null,
      adminUid: by.uid,
      adminEmail: by.email,
      at: Timestamp.now(),
    });
  }
  return result;
}
