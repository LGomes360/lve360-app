// app/api/stripe/checkout/route.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import Stripe from "stripe";

export async function POST(req: NextRequest) {
  try {
    // --- ENVIRONMENT VALIDATION ---
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    const priceMonthly = process.env.STRIPE_PRICE_PREMIUM;
    const priceAnnual = process.env.STRIPE_PRICE_ANNUAL;

    if (!stripeKey || !priceMonthly || !priceAnnual) {
      return NextResponse.json(
        {
          error:
            "Missing Stripe envs (STRIPE_SECRET_KEY, STRIPE_PRICE_PREMIUM, STRIPE_PRICE_ANNUAL)",
        },
        { status: 500 }
      );
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" });

    // --- REQUEST BODY ---
    const { plan, email } = await req.json().catch(() => ({}));

    if (!plan || !email) {
      return NextResponse.json(
        { error: "Missing required fields (plan, email)" },
        { status: 400 }
      );
    }

    // --- DETERMINE PRICE ---
    let priceId: string;
    if (plan === "monthly") priceId = priceMonthly;
    else if (plan === "annual") priceId = priceAnnual;
    else {
      return NextResponse.json(
        { error: "Invalid plan. Must be 'monthly' or 'annual'." },
        { status: 400 }
      );
    }

    const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

    // --- STRIPE CHECKOUT SESSION ---
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: email, // ✅ from prompt
      metadata: { plan },
      success_url: `${APP_URL}/dashboard?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${APP_URL}/upgrade?canceled=1`,
    });

    return NextResponse.json({ ok: true, url: session.url });
  } catch (err: any) {
    console.error("❌ Stripe checkout error:", err);
    return NextResponse.json(
      { error: err?.message ?? "Unexpected error" },
      { status: 500 }
    );
  }
}
