/** เว็บที่อนุญาตให้ฝังหน้านี้ในกรอบ (iframe) คั่นด้วยเว้นวรรคหรือจุลภาค · ค่าเริ่มต้น = FutureX Tool */
const embedOrigins = (process.env.EMBED_ORIGINS || "https://futurex-tool.vercel.app")
  .split(/[\s,]+/)
  .filter(Boolean);

/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["firebase-admin"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // ไม่ให้เว็บอื่นนอกรายการฝังหน้านี้ (กัน clickjacking) · Stripe Checkout เปิดในแท็บใหม่แทน (ดู CheckoutButton)
          { key: "Content-Security-Policy", value: `frame-ancestors 'self' ${embedOrigins.join(" ")}` },
        ],
      },
    ];
  },
};
export default nextConfig;
