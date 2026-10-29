import Stripe from "stripe";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { PLAN_NAME, PLAN_PRICE_SATANG } from "@/lib/config";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });

  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า STRIPE_SECRET_KEY" }, { status: 500 });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const origin = new URL(req.url).origin;

  // ราคามาจากฝั่งเซิร์ฟเวอร์เท่านั้น ไม่รับจากเบราว์เซอร์
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card", "promptpay"],
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "thb",
          unit_amount: PLAN_PRICE_SATANG,
          product_data: { name: PLAN_NAME },
        },
      },
    ],
    customer_email: user.email ?? undefined,
    metadata: { user_id: user.uid },
    success_url: `${origin}/billing`,
    cancel_url: `${origin}/billing`,
  });

  return NextResponse.json({ url: session.url });
}
