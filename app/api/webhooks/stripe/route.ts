import Stripe from "stripe";
import { NextResponse } from "next/server";
import { recordPayment, reversePayment } from "@/lib/store";
import { PLAN_DAYS } from "@/lib/config";

export const runtime = "nodejs";

const PROVIDER = "stripe";

// ใช้ payment_intent เป็นรหัสอ้างอิงชำระเงินทั้งตอนจ่ายและตอนคืนเงิน
function intentId(v: string | Stripe.PaymentIntent | null): string | null {
  if (!v) return null;
  return typeof v === "string" ? v : v.id;
}

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const key = process.env.STRIPE_SECRET_KEY;
  const signature = req.headers.get("stripe-signature");
  if (!secret || !key || !signature) {
    return NextResponse.json({ error: "not configured" }, { status: 400 });
  }

  const stripe = new Stripe(key);
  const raw = await req.text(); // ต้องใช้ body ดิบเพื่อตรวจลายเซ็น

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, signature, secret);
  } catch {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const s = event.data.object as Stripe.Checkout.Session;
      // PromptPay จ่ายแบบไม่พร้อมกัน ต้องรอ paid จริงก่อนค่อยคิดคอมมิชชั่น
      if (s.payment_status !== "paid") break;

      const userId = s.metadata?.user_id;
      const pi = intentId(s.payment_intent);
      if (!userId || !pi || s.amount_total == null) break;

      try {
        await recordPayment({
          userId,
          provider: PROVIDER,
          providerPaymentId: pi,
          amountSatang: s.amount_total,
          days: PLAN_DAYS,
        });
      } catch (error) {
        console.error("recordPayment failed:", error);
        return NextResponse.json({ error: "db" }, { status: 500 }); // ให้ Stripe ลองใหม่
      }
      break;
    }

    case "charge.refunded": {
      const c = event.data.object as Stripe.Charge;
      const pi = intentId(c.payment_intent);
      if (!pi || !c.refunded) break; // นับเฉพาะคืนเงินเต็มจำนวน
      try {
        await reversePayment(PROVIDER, pi);
      } catch (error) {
        console.error("reversePayment failed:", error);
        return NextResponse.json({ error: "db" }, { status: 500 });
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}
