import { test } from "node:test";
import assert from "node:assert/strict";
import { ConcurrencyLimiter, parsePositiveInt, tryAddSlot, withRelease, type Slots } from "./limiter";

test("จำกัดจำนวนพร้อมกัน และปล่อยช่องคืนได้", () => {
  const l = new ConcurrencyLimiter(2);
  const a = l.tryAcquire();
  const b = l.tryAcquire();
  assert.ok(a && b);
  assert.equal(l.tryAcquire(), null); // เต็ม
  assert.equal(l.inUse, 2);
  a!();
  assert.equal(l.inUse, 1);
  assert.ok(l.tryAcquire()); // ว่างแล้ว
});

test("เรียกปล่อยซ้ำ นับครั้งเดียว (ไม่ทำให้ตัวนับติดลบ)", () => {
  const l = new ConcurrencyLimiter(1);
  const a = l.tryAcquire()!;
  a();
  a();
  a();
  assert.equal(l.inUse, 0);
  assert.ok(l.tryAcquire());
  assert.equal(l.tryAcquire(), null);
});

const streamOf = (...parts: string[]) =>
  new ReadableStream<Uint8Array>({
    start(c) {
      const e = new TextEncoder();
      parts.forEach((p) => c.enqueue(e.encode(p)));
      c.close();
    },
  });

async function drain(s: ReadableStream<Uint8Array>) {
  const r = s.getReader();
  const d = new TextDecoder();
  let out = "";
  for (;;) {
    const { done, value } = await r.read();
    if (done) return out;
    out += d.decode(value);
  }
}

test("withRelease: ปล่อยช่องเมื่อสตรีมอ่านจนจบ", async () => {
  const l = new ConcurrencyLimiter(1);
  const rel = l.tryAcquire()!;
  const out = await drain(withRelease(streamOf("ก", "ข"), rel));
  assert.equal(out, "กข");
  assert.equal(l.inUse, 0);
});

test("withRelease: ปล่อยช่องเมื่อผู้ใช้ยกเลิก (ปิดหน้า)", async () => {
  const l = new ConcurrencyLimiter(1);
  const rel = l.tryAcquire()!;
  const s = withRelease(streamOf("ก", "ข"), rel);
  await s.cancel();
  assert.equal(l.inUse, 0);
});

test("withRelease: ปล่อยช่องเมื่อสตรีมพังกลางทาง", async () => {
  const l = new ConcurrencyLimiter(1);
  const rel = l.tryAcquire()!;
  const bad = new ReadableStream<Uint8Array>({
    pull() {
      throw new Error("boom");
    },
  });
  await assert.rejects(drain(withRelease(bad, rel)));
  assert.equal(l.inUse, 0);
});

test("parsePositiveInt", () => {
  assert.equal(parsePositiveInt("12", 8), 12);
  assert.equal(parsePositiveInt(undefined, 8), 8);
  assert.equal(parsePositiveInt("0", 8), 8);
  assert.equal(parsePositiveInt("-3", 8), 8);
  assert.equal(parsePositiveInt("2.5", 8), 8);
  assert.equal(parsePositiveInt("abc", 8), 8);
});

test("tryAddSlot: เพิ่มช่องได้จนเต็ม แล้วปฏิเสธ", () => {
  let slots: Slots = {};
  for (const id of ["a", "b", "c"]) {
    const r = tryAddSlot(slots, id, 1000, 3, 60_000);
    assert.equal(r.ok, true);
    slots = r.slots;
  }
  const full = tryAddSlot(slots, "d", 1000, 3, 60_000);
  assert.equal(full.ok, false);
  assert.deepEqual(Object.keys(full.slots).sort(), ["a", "b", "c"]);
});

test("tryAddSlot: ช่องที่หมดอายุถูกล้าง ทำให้มีที่ว่าง (กรณี instance ดับกลางคัน)", () => {
  const slots: Slots = { a: 500, b: 800, c: 5000 }; // a,b หมดอายุที่เวลา 1000
  const r = tryAddSlot(slots, "d", 1000, 3, 60_000);
  assert.equal(r.ok, true);
  assert.equal(r.pruned, true);
  assert.deepEqual(Object.keys(r.slots).sort(), ["c", "d"]);
  assert.equal(r.slots.d, 61_000);
});

test("tryAddSlot: ไม่แก้ object เดิม และคิวเต็มโดยไม่มีช่องหมดอายุ = pruned เป็น false", () => {
  const slots: Slots = { a: 5000, b: 5000 };
  const r = tryAddSlot(slots, "c", 1000, 2, 1000);
  assert.equal(r.ok, false);
  assert.equal(r.pruned, false);
  assert.deepEqual(slots, { a: 5000, b: 5000 });
});

test("tryAddSlot: จำลองคำขอซ้อนกัน 20 รายการ ได้ช่องไม่เกิน max", () => {
  let slots: Slots = {};
  let granted = 0;
  for (let i = 0; i < 20; i++) {
    const r = tryAddSlot(slots, `s${i}`, 1000, 8, 60_000);
    slots = r.slots;
    if (r.ok) granted++;
  }
  assert.equal(granted, 8);
});
