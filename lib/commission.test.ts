import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SETTINGS,
  computeShares,
  parseSettings,
  planPayment,
  levelPctsOf,
  pvOf,
  pvExact,
  rankFor,
  validateAdminSettings,
  reverseStatus,
} from "./commission";

const now = new Date("2026-01-01T00:00:00Z");
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

test("ผลรวมทุกชั้นเท่ากับก้อนคอมมิชชั่นเป๊ะ (1,000 บาท, 30%)", () => {
  const { pool, shares } = computeShares(100000, DEFAULT_SETTINGS);
  assert.equal(pool, 30000);
  assert.equal(sum(shares), 30000);
  assert.equal(shares.length, 6);
});

test("เศษสตางค์ตกที่ชั้น 1 และผลรวมยังเท่าก้อน (299 บาท)", () => {
  const { pool, shares } = computeShares(29900, DEFAULT_SETTINGS);
  assert.equal(pool, Math.floor((29900 * 30) / 100)); // 8970
  assert.equal(sum(shares), pool);
  assert.ok(shares[0] >= shares[1]);
});

test("poolPct ทศนิยมไม่คลาดเคลื่อน", () => {
  const { pool } = computeShares(10000, { ...DEFAULT_SETTINGS, poolPct: 12.34 });
  assert.equal(pool, 1234);
});

test("ยอดไม่ใช่จำนวนเต็มบวกถูกปฏิเสธ", () => {
  assert.throws(() => computeShares(0, DEFAULT_SETTINGS));
  assert.throws(() => computeShares(-5, DEFAULT_SETTINGS));
  assert.throws(() => computeShares(10.5, DEFAULT_SETTINGS));
});

test("สายยาว 8 ชั้น: จ่ายให้ 6 ชั้นแรกครบ ไม่มีส่วนบริษัท", () => {
  const upline = ["u7", "u6", "u5", "u4", "u3", "u2"];
  const { ledger } = planPayment({
    amountSatang: 100000, days: 30, now, currentPaidUntil: null, upline, settings: DEFAULT_SETTINGS,
  });
  assert.deepEqual(ledger.map((l) => l.beneficiaryId), upline);
  assert.equal(sum(ledger.map((l) => l.amountSatang)), 30000);
});

test("สายสั้น: ชั้น 2-6 เข้าบริษัท (null)", () => {
  const { ledger } = planPayment({
    amountSatang: 29900, days: 30, now, currentPaidUntil: null, upline: ["s1"], settings: DEFAULT_SETTINGS,
  });
  assert.equal(ledger[0].beneficiaryId, "s1");
  assert.ok(ledger.slice(1).every((l) => l.beneficiaryId === null));
  assert.equal(sum(ledger.map((l) => l.amountSatang)), 8970);
});

test("ไม่มีผู้แนะนำ: ทุกชั้นเข้าบริษัท", () => {
  const { ledger } = planPayment({
    amountSatang: 29900, days: 30, now, currentPaidUntil: null, upline: [], settings: DEFAULT_SETTINGS,
  });
  assert.equal(ledger.filter((l) => l.beneficiaryId === null).length, 6);
});

test("ต่ออายุ: เริ่มนับจากวันนี้ถ้าหมดอายุแล้ว / ต่อท้ายถ้ายังไม่หมด", () => {
  const day = 86400000;
  const fresh = planPayment({ amountSatang: 100, days: 30, now, currentPaidUntil: null, upline: [], settings: DEFAULT_SETTINGS });
  assert.equal(fresh.paidUntil.getTime(), now.getTime() + 30 * day);

  const expired = planPayment({ amountSatang: 100, days: 30, now, currentPaidUntil: new Date(now.getTime() - day), upline: [], settings: DEFAULT_SETTINGS });
  assert.equal(expired.paidUntil.getTime(), now.getTime() + 30 * day);

  const active = planPayment({ amountSatang: 100, days: 30, now, currentPaidUntil: new Date(now.getTime() + 10 * day), upline: [], settings: DEFAULT_SETTINGS });
  assert.equal(active.paidUntil.getTime(), now.getTime() + 40 * day);
});

test("availableAt = now + holdDays และเก็บ rate snapshot", () => {
  const { ledger } = planPayment({ amountSatang: 100000, days: 30, now, currentPaidUntil: null, upline: [], settings: DEFAULT_SETTINGS });
  assert.equal(ledger[0].availableAt.getTime(), now.getTime() + 14 * 86400000);
  assert.deepEqual(ledger[0].rateSnapshot, { poolPct: 30, weights: [10, 8, 6, 4, 2, 1], weightTotal: 31 });
});

test("คืนเงิน: held -> reversed, paid -> clawback", () => {
  assert.equal(reverseStatus("held"), "reversed");
  assert.equal(reverseStatus("paid"), "clawback");
  assert.equal(reverseStatus("reversed"), "reversed");
  assert.equal(reverseStatus("clawback"), "clawback");
});

test("settings: ไม่มีเอกสาร = ค่าเริ่มต้น, ค่าผิด = error", () => {
  assert.deepEqual(parseSettings(undefined), DEFAULT_SETTINGS);
  assert.deepEqual(parseSettings({ poolPct: 20, weights: [1, 1, 1, 1, 1, 1], holdDays: 7 }), {
    poolPct: 20, weights: [1, 1, 1, 1, 1, 1], holdDays: 7,
    pvPerBaht: 1, requireActive: false, displayAs: "both", ranks: [{ name: "สมาชิก", minTeamPv: 0, levels: 6 }],
  });
  assert.throws(() => parseSettings({ poolPct: 120, weights: [1, 1, 1, 1, 1, 1], holdDays: 7 }));
  assert.doesNotThrow(() => parseSettings({ poolPct: 30, weights: [1, 2, 3], holdDays: 7 }));
  assert.throws(() => parseSettings({ poolPct: 30, weights: [], holdDays: 7 }));
  assert.throws(() => parseSettings({ poolPct: 30, weights: Array(11).fill(1), holdDays: 7 }));
  assert.throws(() => parseSettings({ poolPct: 30, weights: [0, 0, 0, 0, 0, 0], holdDays: 7 }));
  assert.throws(() => parseSettings({ poolPct: 30, weights: [1, 1, 1, 1, 1, 1], holdDays: -1 }));
});

test("ฟอร์มแอดมิน: กรอก % ต่อชั้น ได้ชั้นละ % ตามที่กรอกพอดี และผลรวมไม่เกินที่กรอก", () => {
  const s = validateAdminSettings({ levelPcts: [10, 5, 2.5], holdDays: 7 });
  assert.equal(s.poolPct, 17.5);
  const { pool, shares } = computeShares(100000, s); // 1,000 บาท
  assert.deepEqual(shares, [10000, 5000, 2500]);
  assert.equal(pool, 17500);
  assert.equal(sum(shares), pool);
});

test("ฟอร์มแอดมิน: เศษสตางค์ยังตกชั้น 1 และผลรวมเท่าก้อน", () => {
  const s = validateAdminSettings({ levelPcts: [7.77, 3.33, 1.11], holdDays: 0 });
  const { pool, shares } = computeShares(29900, s);
  assert.equal(sum(shares), pool);
  assert.ok(pool <= 29900 * 0.1221);
});

test("ฟอร์มแอดมิน: ตั้งได้ถึง 10 ชั้น แต่ผลรวมเกิน 50% ถูกปฏิเสธ", () => {
  assert.doesNotThrow(() => validateAdminSettings({ levelPcts: Array(10).fill(5), holdDays: 14 })); // รวม 50%
  assert.throws(() => validateAdminSettings({ levelPcts: Array(10).fill(10), holdDays: 14 }));      // 10% x 10 = 100%
  assert.throws(() => validateAdminSettings({ levelPcts: Array(11).fill(1), holdDays: 14 }));       // เกิน 10 ชั้น
  assert.throws(() => validateAdminSettings({ levelPcts: [30, 30], holdDays: 14 }));                // รวม 60%
});

test("ฟอร์มแอดมิน: ปฏิเสธค่าผิดรูปแบบ", () => {
  const ok = { levelPcts: [10, 8, 6], holdDays: 14 };
  assert.doesNotThrow(() => validateAdminSettings(ok));
  assert.throws(() => validateAdminSettings({ ...ok, levelPcts: [] }));
  assert.throws(() => validateAdminSettings({ ...ok, levelPcts: [0, 0] }));
  assert.throws(() => validateAdminSettings({ ...ok, levelPcts: [-1, 5] }));
  assert.throws(() => validateAdminSettings({ ...ok, levelPcts: [1.005, 5] }));
  assert.throws(() => validateAdminSettings({ ...ok, levelPcts: [Number.NaN] }));
  assert.throws(() => validateAdminSettings({ ...ok, holdDays: 91 }));
  assert.throws(() => validateAdminSettings({ ...ok, holdDays: 1.5 }));
  assert.throws(() => validateAdminSettings(null));
});

test("levelPctsOf แปลงค่าที่เก็บกลับเป็น % ต่อชั้น", () => {
  assert.deepEqual(levelPctsOf({ ...DEFAULT_SETTINGS, poolPct: 17.5, weights: [1000, 500, 250], holdDays: 0 }), [10, 5, 2.5]);
});

const RANKED = {
  ...DEFAULT_SETTINGS,
  requireActive: true,
  ranks: [
    { name: "S", minTeamPv: 0, levels: 1 },
    { name: "M", minTeamPv: 1000, levels: 3 },
    { name: "L", minTeamPv: 3000, levels: 6 },
  ],
};

test("pvOf และ rankFor", () => {
  assert.equal(pvOf(29900, 1), 299);
  assert.equal(pvOf(29900, 0.5), 150);
  assert.equal(rankFor(RANKED.ranks, 0).name, "S");
  assert.equal(rankFor(RANKED.ranks, 999).name, "S");
  assert.equal(rankFor(RANKED.ranks, 1000).name, "M");
  assert.equal(rankFor(RANKED.ranks, 99999).name, "L");
});

test("ยศจำกัดจำนวนชั้นที่รับ: ชั้นเกินยศเข้าบริษัท และผลรวมเท่าเดิม", () => {
  const upline = ["a", "b", "c", "d", "e", "f"];
  const stats = [
    { active: true, teamPv: 0 },    // ชั้น 1 ยศ S รับได้ 1 ชั้น -> ได้
    { active: true, teamPv: 0 },    // ชั้น 2 ยศ S -> เข้าบริษัท (rank)
    { active: true, teamPv: 1500 }, // ชั้น 3 ยศ M รับได้ 3 ชั้น -> ได้
    { active: true, teamPv: 1500 }, // ชั้น 4 ยศ M -> เข้าบริษัท
    { active: true, teamPv: 5000 }, // ชั้น 5 ยศ L -> ได้
    { active: true, teamPv: 5000 }, // ชั้น 6 ยศ L -> ได้
  ];
  const { ledger } = planPayment({
    amountSatang: 100000, days: 30, now, currentPaidUntil: null, upline, uplineStats: stats, settings: RANKED,
  });
  assert.deepEqual(ledger.map((l) => l.beneficiaryId), ["a", null, "c", null, "e", "f"]);
  assert.deepEqual(ledger.map((l) => l.reason), [null, "rank", null, "rank", null, null]);
  assert.equal(ledger[1].intendedBeneficiaryId, "b");
  const { pool } = computeShares(100000, RANKED);
  assert.equal(sum(ledger.map((l) => l.amountSatang)), pool); // ยศไม่ทำให้จ่ายเกินก้อน
});

test("requireActive: ผู้รับที่แพ็กเกจหมดอายุ ส่วนนั้นเข้าบริษัท", () => {
  const { ledger } = planPayment({
    amountSatang: 100000, days: 30, now, currentPaidUntil: null, upline: ["a"],
    uplineStats: [{ active: false, teamPv: 9999 }], settings: RANKED,
  });
  assert.equal(ledger[0].beneficiaryId, null);
  assert.equal(ledger[0].reason, "inactive");
  const off = planPayment({
    amountSatang: 100000, days: 30, now, currentPaidUntil: null, upline: ["a"],
    uplineStats: [{ active: false, teamPv: 9999 }], settings: { ...RANKED, requireActive: false },
  });
  assert.equal(off.ledger[0].beneficiaryId, "a");
});

test("ฟอร์มแอดมิน: ตั้งยศได้ และตรวจกติกายศ", () => {
  const base = { levelPcts: [10, 5, 2], holdDays: 7, pvPerBaht: 1, requireActive: true };
  const s = validateAdminSettings({
    ...base,
    ranks: [{ name: "S", minTeamPv: 0, levels: 1 }, { name: "M", minTeamPv: 500, levels: 3 }],
  });
  assert.equal(s.ranks.length, 2);
  assert.equal(s.requireActive, true);
  const bad = (ranks: unknown) => assert.throws(() => validateAdminSettings({ ...base, ranks }));
  bad([{ name: "S", minTeamPv: 100, levels: 1 }]);                                   // ยศแรกไม่ใช่ 0
  bad([{ name: "S", minTeamPv: 0, levels: 4 }]);                                     // เกินจำนวนชั้น
  bad([{ name: "S", minTeamPv: 0, levels: 1 }, { name: "M", minTeamPv: 0, levels: 2 }]);   // PV ไม่เพิ่ม
  bad([{ name: "S", minTeamPv: 0, levels: 3 }, { name: "M", minTeamPv: 10, levels: 1 }]);  // ยศสูงรับน้อยลง
  bad([{ name: "", minTeamPv: 0, levels: 1 }]);                                      // ไม่มีชื่อ
  bad(Array.from({ length: 9 }, (_, i) => ({ name: `R${i}`, minTeamPv: i * 10, levels: 1 })));
  assert.throws(() => validateAdminSettings({ ...base, pvPerBaht: 0 }));
});

test("PV ของยอดคอมมิชชั่น: pvExact และเก็บ pv ในแถวสมุดบัญชี", () => {
  assert.equal(pvExact(29900, 1), 299);
  assert.equal(pvExact(2990, 1), 29.9);
  assert.equal(pvExact(1234, 0.5), 6.17);
  const { ledger } = planPayment({
    amountSatang: 100000, days: 30, now, currentPaidUntil: null, upline: ["a", "b"],
    settings: { ...DEFAULT_SETTINGS, pvPerBaht: 2 },
  });
  assert.equal(ledger[0].pv, pvExact(ledger[0].amountSatang, 2));
  assert.ok(ledger.every((l) => l.pv >= 0));
});

test("displayAs: ค่าเริ่มต้น both, ตรวจค่าผิด, และฟอร์มแอดมินส่งต่อได้", () => {
  assert.equal(parseSettings({ poolPct: 20, weights: [1], holdDays: 0 }).displayAs, "both");
  assert.throws(() => parseSettings({ poolPct: 20, weights: [1], holdDays: 0, displayAs: "usd" }));
  const s = validateAdminSettings({ levelPcts: [10], holdDays: 0, displayAs: "pv" });
  assert.equal(s.displayAs, "pv");
  assert.throws(() => validateAdminSettings({ levelPcts: [10], holdDays: 0, displayAs: "x" }));
});
