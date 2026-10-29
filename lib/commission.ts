// ตรรกะเงินล้วน ๆ (ไม่แตะฐานข้อมูล) ทดสอบได้ด้วย `npm test`
// store.ts เรียกใช้ฟังก์ชันเหล่านี้ภายในธุรกรรมของ Firestore

// ความลึกสูงสุดของสายแนะนำที่ระบบเก็บไว้ (จำนวนชั้นที่ใช้จ่ายจริงตั้งในหน้าแอดมิน 1..LEVELS)
// สมาชิกที่สมัครก่อนเปลี่ยนค่านี้เก็บสายบนไว้แค่ 6 ชั้น ชั้นที่ลึกกว่านั้นของพวกเขาจะเข้าบริษัท
export const LEVELS = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

// ยศ: ได้จาก "PV ทีมในเดือนนั้น" = PV ของค่าบริการที่สมาชิกในสายล่างจ่ายจริง (ไม่ใช่ยอดที่ตัวเองซื้อ)
// levels = จำนวนชั้นที่ยศนี้รับคอมมิชชั่นได้ (ชั้นที่เกินส่วนนั้นเข้าบริษัท) จึงไม่มีทางจ่ายเกินเพดานรวมที่ตั้งไว้
export type Rank = { name: string; minTeamPv: number; levels: number };

export const MAX_RANKS = 8;

// วิธีแสดงยอดคอมมิชชั่นให้สมาชิกเห็น: เป็นบาท / เป็น PV / ทั้งสองอย่าง (ตัวเลขเงินจริงที่เก็บยังเป็นสตางค์เสมอ)
export type DisplayAs = "baht" | "pv" | "both";
export const DISPLAY_OPTIONS: DisplayAs[] = ["baht", "pv", "both"];

export type CommissionSettings = {
  poolPct: number; // % ของยอดชำระที่กันไว้เป็นก้อนคอมมิชชั่น (ทศนิยม 2 ตำแหน่ง)
  weights: number[]; // น้ำหนักชั้น 1..N (N = 1..LEVELS, จำนวนเต็ม) จำนวนช่องคือจำนวนชั้นที่จ่าย
  holdDays: number; // จำนวนวันที่ยอดอยู่สถานะ held
  pvPerBaht: number; // PV ต่อ 1 บาทของยอดชำระ (1 = 299 บาทได้ 299 PV)
  requireActive: boolean; // true = ผู้รับต้องมีแพ็กเกจที่ยังไม่หมดอายุ ไม่งั้นส่วนนั้นเข้าบริษัท
  displayAs: DisplayAs; // วิธีแสดงยอดคอมมิชชั่นในหน้าสมาชิก
  ranks: Rank[]; // เรียงตาม minTeamPv น้อย -> มาก ตัวแรกต้อง minTeamPv = 0
};

export const DEFAULT_SETTINGS: CommissionSettings = {
  poolPct: 30,
  weights: [10, 8, 6, 4, 2, 1],
  holdDays: 14,
  pvPerBaht: 1,
  requireActive: false,
  displayAs: "both",
  ranks: [{ name: "สมาชิก", minTeamPv: 0, levels: 6 }],
};

export const pvOf = (amountSatang: number, pvPerBaht: number) =>
  Math.round((amountSatang * pvPerBaht) / 100);

// เดือนตามเวลาไทย รูปแบบ YYYY-MM (ใช้เป็นรอบนับ PV ทีม)
export const bangkokMonth = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(d).slice(0, 7);

// ยอดเงินเป็น PV ทศนิยม 2 ตำแหน่ง ใช้แสดงยอดคอมมิชชั่น (ไม่ใช่ตัวเลขที่ใช้จ่ายเงิน)
export const pvExact = (amountSatang: number, pvPerBaht: number) =>
  Math.round(amountSatang * pvPerBaht) / 100;

export function rankFor(ranks: Rank[], teamPv: number): Rank {
  let r = ranks[0];
  for (const x of ranks) if (teamPv >= x.minTeamPv) r = x;
  return r;
}

function parseRanks(raw: unknown, levelCount: number): Rank[] {
  if (raw == null) return [{ name: "สมาชิก", minTeamPv: 0, levels: levelCount }];
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > MAX_RANKS) {
    throw new Error(`commission settings: ranks ต้องมี 1-${MAX_RANKS} ยศ`);
  }
  const ranks = raw.map((r: Partial<Rank>) => {
    if (
      !r ||
      typeof r.name !== "string" ||
      !r.name.trim() ||
      r.name.length > 20 ||
      !Number.isInteger(r.minTeamPv) ||
      (r.minTeamPv as number) < 0 ||
      !Number.isInteger(r.levels) ||
      (r.levels as number) < 1 ||
      (r.levels as number) > levelCount
    ) {
      throw new Error(`commission settings: ยศผิดรูปแบบ (ชื่อ, minTeamPv >= 0, levels 1-${levelCount})`);
    }
    return { name: r.name.trim(), minTeamPv: r.minTeamPv as number, levels: r.levels as number };
  });
  if (ranks[0].minTeamPv !== 0) throw new Error("commission settings: ยศแรกต้องมี minTeamPv = 0");
  for (let i = 1; i < ranks.length; i++) {
    if (ranks[i].minTeamPv <= ranks[i - 1].minTeamPv) {
      throw new Error("commission settings: minTeamPv ของยศต้องเพิ่มขึ้นเรื่อย ๆ");
    }
    if (ranks[i].levels < ranks[i - 1].levels) {
      throw new Error("commission settings: ยศสูงกว่าต้องรับได้ไม่น้อยกว่าจำนวนชั้นของยศต่ำกว่า");
    }
  }
  return ranks;
}

// อ่านค่าจากเอกสาร settings/commission ถ้าไม่มีเอกสารใช้ค่าเริ่มต้น
// ถ้ามีแต่ค่าผิดรูปแบบ "โยน error" เพื่อไม่ให้คิดเงินผิดแบบเงียบ ๆ (webhook จะตอบ 500 แล้ว Stripe ลองใหม่)
export function parseSettings(raw: unknown): CommissionSettings {
  if (raw == null) return DEFAULT_SETTINGS;
  const r = raw as Partial<CommissionSettings>;
  const { poolPct, weights, holdDays } = r;
  const rr = raw as { pvPerBaht?: unknown; requireActive?: unknown; ranks?: unknown; displayAs?: unknown };
  if (typeof poolPct !== "number" || !(poolPct >= 0 && poolPct <= 100)) {
    throw new Error("commission settings: poolPct ต้องอยู่ระหว่าง 0-100");
  }
  if (
    !Array.isArray(weights) ||
    weights.length < 1 ||
    weights.length > LEVELS ||
    !weights.every((w) => Number.isInteger(w) && w >= 0) ||
    weights.reduce((a, b) => a + b, 0) <= 0
  ) {
    throw new Error(`commission settings: weights ต้องมี 1-${LEVELS} ค่า เป็นจำนวนเต็มไม่ติดลบ และรวมมากกว่า 0`);
  }
  if (typeof holdDays !== "number" || !Number.isInteger(holdDays) || holdDays < 0) {
    throw new Error("commission settings: holdDays ต้องเป็นจำนวนเต็มไม่ติดลบ");
  }
  const pvPerBaht = rr.pvPerBaht == null ? 1 : rr.pvPerBaht;
  if (typeof pvPerBaht !== "number" || !(pvPerBaht > 0 && pvPerBaht <= 1000)) {
    throw new Error("commission settings: pvPerBaht ต้องมากกว่า 0 และไม่เกิน 1000");
  }
  const requireActive = rr.requireActive == null ? false : rr.requireActive;
  if (typeof requireActive !== "boolean") {
    throw new Error("commission settings: requireActive ต้องเป็น true/false");
  }
  const displayAs = rr.displayAs == null ? "both" : rr.displayAs;
  if (!DISPLAY_OPTIONS.includes(displayAs as DisplayAs)) {
    throw new Error("commission settings: displayAs ต้องเป็น baht / pv / both");
  }
  return {
    poolPct, weights, holdDays, pvPerBaht, requireActive,
    displayAs: displayAs as DisplayAs,
    ranks: parseRanks(rr.ranks, weights.length),
  };
}

// เพดานที่หน้าแอดมินยอมให้ตั้ง (กันพิมพ์ผิด/ตั้งสูงจนจ่ายเกินรายรับ)
// ผลรวม % ของทุกชั้นต้องไม่เกิน maxPoolPct ของยอดชำระ จึงจ่ายออกเกินยอดที่เข้ามาไม่ได้ ไม่ว่าจะตั้งกี่ชั้น
export const ADMIN_LIMITS = { maxPoolPct: 50, maxHoldDays: 90 } as const;

// แอดมินกรอก "% ของยอดชำระ ต่อชั้น" (ทศนิยมไม่เกิน 2 ตำแหน่ง) จำนวนช่อง = จำนวนชั้นที่จ่าย
// แปลงเป็นรูปแบบที่ระบบเก็บ: weights = % x 100 (จำนวนเต็ม) และ poolPct = ผลรวม จึงได้ชั้นละ % ตามที่กรอกพอดี
export function validateAdminSettings(raw: unknown): CommissionSettings {
  if (!raw || typeof raw !== "object") throw new Error("รูปแบบข้อมูลไม่ถูกต้อง");
  const { levelPcts, holdDays, pvPerBaht, requireActive, ranks, displayAs } = raw as {
    levelPcts?: unknown; holdDays?: unknown; pvPerBaht?: unknown; requireActive?: unknown; ranks?: unknown; displayAs?: unknown;
  };

  if (!Array.isArray(levelPcts) || levelPcts.length < 1 || levelPcts.length > LEVELS) {
    throw new Error(`จำนวนชั้นต้องอยู่ระหว่าง 1-${LEVELS}`);
  }
  const bps = levelPcts.map((p, i) => {
    if (typeof p !== "number" || !Number.isFinite(p) || p < 0 || p > ADMIN_LIMITS.maxPoolPct) {
      throw new Error(`ชั้น ${i + 1}: ต้องเป็นตัวเลข 0-${ADMIN_LIMITS.maxPoolPct}%`);
    }
    const v = Math.round(p * 100);
    if (Math.abs(p * 100 - v) > 1e-6) throw new Error(`ชั้น ${i + 1}: ทศนิยมไม่เกิน 2 ตำแหน่ง`);
    return v;
  });
  const totalBps = bps.reduce((a, b) => a + b, 0);
  if (totalBps <= 0) throw new Error("ต้องมีอย่างน้อยหนึ่งชั้นที่มากกว่า 0%");
  if (totalBps > ADMIN_LIMITS.maxPoolPct * 100) {
    throw new Error(
      `ผลรวมทุกชั้นต้องไม่เกิน ${ADMIN_LIMITS.maxPoolPct}% ของยอดชำระ (ตอนนี้ ${(totalBps / 100).toFixed(2)}%)`
    );
  }
  if (
    typeof holdDays !== "number" ||
    !Number.isInteger(holdDays) ||
    holdDays < 0 ||
    holdDays > ADMIN_LIMITS.maxHoldDays
  ) {
    throw new Error(`จำนวนวันพักยอดต้องเป็นจำนวนเต็ม 0-${ADMIN_LIMITS.maxHoldDays}`);
  }
  if (pvPerBaht != null && (typeof pvPerBaht !== "number" || !(pvPerBaht > 0 && pvPerBaht <= 1000))) {
    throw new Error("PV ต่อบาทต้องมากกว่า 0 และไม่เกิน 1000");
  }
  if (Array.isArray(ranks)) {
    if (ranks.length < 1 || ranks.length > MAX_RANKS) throw new Error(`ยศต้องมี 1-${MAX_RANKS} ยศ`);
    ranks.forEach((r: Partial<Rank>, i) => {
      if (!r || typeof r.name !== "string" || !r.name.trim() || r.name.length > 20) {
        throw new Error(`ยศที่ ${i + 1}: ใส่ชื่อ (ไม่เกิน 20 ตัวอักษร)`);
      }
      if (!Number.isInteger(r.minTeamPv) || (r.minTeamPv as number) < 0) {
        throw new Error(`ยศ ${r.name}: PV ทีมขั้นต่ำต้องเป็นจำนวนเต็มไม่ติดลบ`);
      }
      if (!Number.isInteger(r.levels) || (r.levels as number) < 1 || (r.levels as number) > bps.length) {
        throw new Error(`ยศ ${r.name}: จำนวนชั้นที่รับได้ต้องอยู่ระหว่าง 1-${bps.length}`);
      }
    });
    if ((ranks[0] as Rank).minTeamPv !== 0) throw new Error("ยศแรกต้องมี PV ทีมขั้นต่ำ = 0");
    for (let i = 1; i < ranks.length; i++) {
      const a = ranks[i - 1] as Rank, b = ranks[i] as Rank;
      if (b.minTeamPv <= a.minTeamPv) throw new Error(`ยศ ${b.name}: PV ต้องมากกว่ายศ ${a.name}`);
      if (b.levels < a.levels) throw new Error(`ยศ ${b.name}: ต้องรับได้ไม่น้อยกว่าชั้นของยศ ${a.name}`);
    }
  } else if (ranks != null) {
    throw new Error("รูปแบบยศไม่ถูกต้อง");
  }
  return parseSettings({
    poolPct: totalBps / 100, weights: bps, holdDays,
    pvPerBaht: pvPerBaht ?? 1, requireActive: requireActive === true, displayAs, ranks,
  });
}

// แปลงค่าที่เก็บ กลับเป็น % ต่อชั้นสำหรับแสดงในฟอร์ม
export function levelPctsOf(s: CommissionSettings): number[] {
  const total = s.weights.reduce((a, b) => a + b, 0);
  return s.weights.map((w) => Math.round(((s.poolPct * w) / total) * 100) / 100);
}

// แบ่งก้อนคอมมิชชั่นตามน้ำหนัก เศษสตางค์ตกที่ชั้น 1 ผลรวมจึงเท่ากับก้อนเป๊ะ
export function computeShares(amountSatang: number, s: CommissionSettings) {
  if (!Number.isSafeInteger(amountSatang) || amountSatang <= 0) {
    throw new Error("amountSatang ต้องเป็นจำนวนเต็มบวก");
  }
  const total = s.weights.reduce((a, b) => a + b, 0);
  // คูณเป็นหน่วย 1/100 % เพื่อเลี่ยงปัญหาทศนิยมลอยตัว
  const pool = Math.floor((amountSatang * Math.round(s.poolPct * 100)) / 10000);
  const shares = s.weights.map((w) => Math.floor((pool * w) / total));
  const remainder = pool - shares.reduce((a, b) => a + b, 0);
  shares[0] += remainder;
  return { pool, shares, weightTotal: total };
}

export type LedgerPlan = {
  level: number;
  beneficiaryId: string | null; // null = ส่วนของบริษัท
  intendedBeneficiaryId: string | null; // ผู้ที่ควรได้แต่ไม่ผ่านเงื่อนไข (null = ไม่มี)
  rank: string | null; // ยศของผู้รับ ณ ตอนคิด
  reason: "inactive" | "rank" | null; // เหตุที่ส่วนนี้เข้าบริษัท
  amountSatang: number;
  pv: number; // ยอดคอมมิชชั่นนี้เป็น PV ตามอัตรา ณ ตอนคิด (ไว้แสดงผล)
  availableAt: Date;
  rateSnapshot: { poolPct: number; weights: number[]; weightTotal: number };
};

// วางแผนผลของการชำระเงินหนึ่งครั้ง: วันหมดอายุใหม่ + แถวคอมมิชชั่น 6 ชั้น
// upline[0] = ผู้แนะนำชั้น 1, upline[1] = ผู้แนะนำของผู้แนะนำ ... สั้นกว่า 6 = ที่เหลือเข้าบริษัท
export function planPayment(args: {
  amountSatang: number;
  days: number;
  now: Date;
  currentPaidUntil: Date | null;
  upline: string[];
  // ข้อมูลของแต่ละคนในสายบน (ลำดับเดียวกับ upline) ถ้าไม่ส่งมา = ไม่ตรวจยศ/สถานะ
  // teamPv = PV ทีมของเดือนนี้ "รวมการชำระครั้งนี้แล้ว"
  uplineStats?: { active: boolean; teamPv: number }[];
  settings: CommissionSettings;
}) {
  const { amountSatang, days, now, currentPaidUntil, upline, uplineStats, settings } = args;
  const base = currentPaidUntil && currentPaidUntil > now ? currentPaidUntil : now;
  const paidUntil = new Date(base.getTime() + days * DAY_MS);
  const { shares, weightTotal } = computeShares(amountSatang, settings);
  const availableAt = new Date(now.getTime() + settings.holdDays * DAY_MS);
  const rateSnapshot = { poolPct: settings.poolPct, weights: settings.weights, weightTotal };
  const ledger: LedgerPlan[] = shares.map((amount, i) => {
    const intended: string | null = upline[i] ?? null;
    const st = intended ? uplineStats?.[i] : undefined;
    let beneficiaryId: string | null = intended;
    let rank: string | null = null;
    let reason: "inactive" | "rank" | null = null;
    if (intended && st) {
      const r = rankFor(settings.ranks, st.teamPv);
      rank = r.name;
      if (settings.requireActive && !st.active) {
        beneficiaryId = null;
        reason = "inactive";
      } else if (i + 1 > r.levels) {
        beneficiaryId = null;
        reason = "rank";
      }
    }
    return {
      level: i + 1,
      beneficiaryId,
      intendedBeneficiaryId: reason ? intended : null,
      rank,
      reason,
      amountSatang: amount,
      pv: pvExact(amount, settings.pvPerBaht),
      availableAt,
      rateSnapshot,
    };
  });
  return { paidUntil, ledger };
}

export type LedgerStatus = "held" | "paid" | "reversed" | "clawback";

// คืนเงิน: held -> reversed (ยกเลิก), paid -> clawback (ต้องเรียกคืนเอง), อย่างอื่นคงเดิม
export function reverseStatus(s: LedgerStatus): LedgerStatus {
  if (s === "held") return "reversed";
  if (s === "paid") return "clawback";
  return s;
}
