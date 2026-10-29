// ส่งอีเมลผ่าน Resend (https://resend.com) ตั้ง 2 ตัวแปรนี้แล้วระบบจะเปิดการยืนยันอีเมลและลืมรหัสผ่านให้เอง
//   RESEND_API_KEY  คีย์จาก Resend
//   MAIL_FROM       ผู้ส่ง เช่น  TerraVoltec AI <noreply@โดเมนของคุณ>  (โดเมนต้องยืนยันใน Resend แล้ว)
// ไม่ตั้ง = ปิดระบบอีเมล สมัครแล้วใช้งานได้ทันที และลืมรหัสผ่านทางอีเมลไม่ได้

export function mailConfigured(): boolean {
  return !!(process.env.RESEND_API_KEY && process.env.MAIL_FROM);
}

export function siteOrigin(req: Request): string {
  const env = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, "");
  return env || new URL(req.url).origin;
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export async function sendMail(to: string, subject: string, html: string): Promise<void> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: process.env.MAIL_FROM, to, subject, html }),
  });
  if (!res.ok) {
    throw new Error(`mail ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
  }
}

function layout(appName: string, intro: string, label: string, link: string, outro: string): string {
  return `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;line-height:1.6">
<h2>${esc(appName)}</h2>
<p>${esc(intro)}</p>
<p><a href="${esc(link)}" style="display:inline-block;background:#0e7490;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none">${esc(label)}</a></p>
<p style="color:#555;font-size:14px">หากกดปุ่มไม่ได้ ให้คัดลอกลิงก์นี้ไปเปิดในเบราว์เซอร์:<br>${esc(link)}</p>
<p style="color:#555;font-size:14px">${esc(outro)}</p>
</div>`;
}

export function verifyMail(appName: string, link: string) {
  return {
    subject: `ยืนยันอีเมลของคุณ - ${appName}`,
    html: layout(appName, "กดปุ่มด้านล่างเพื่อยืนยันอีเมลและเริ่มใช้งาน (ลิงก์ใช้ได้ 24 ชั่วโมง)", "ยืนยันอีเมล", link, "ถ้าคุณไม่ได้สมัครสมาชิก ไม่ต้องทำอะไร ปล่อยอีเมลนี้ไว้ได้เลย"),
  };
}

export function resetMail(appName: string, link: string) {
  return {
    subject: `ตั้งรหัสผ่านใหม่ - ${appName}`,
    html: layout(appName, "กดปุ่มด้านล่างเพื่อตั้งรหัสผ่านใหม่ (ลิงก์ใช้ได้ 1 ชั่วโมง และใช้ได้ครั้งเดียว)", "ตั้งรหัสผ่านใหม่", link, "ถ้าคุณไม่ได้ขอ ไม่ต้องทำอะไร รหัสผ่านเดิมยังใช้ได้ตามปกติ"),
  };
}
