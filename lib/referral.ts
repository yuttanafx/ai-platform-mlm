// รหัสแนะนำ: ตัวอักษร/ตัวเลข 4-16 ตัว (ระบบสร้างให้เป็นฐานสิบหก 8 ตัว)
export const CODE_RE = /^[A-Z0-9]{4,16}$/;

// รับได้ทั้งรหัสล้วน ๆ หรือลิงก์แนะนำเต็ม (…/login?ref=XXXXXXXX) แล้วดึงรหัสออกมา
export function parseReferrerCode(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const t = input.trim();
  if (!t) return null;
  const m = t.match(/[?&]ref=([A-Za-z0-9]+)/i);
  const code = (m ? m[1] : t).toUpperCase();
  return CODE_RE.test(code) ? code : null;
}
