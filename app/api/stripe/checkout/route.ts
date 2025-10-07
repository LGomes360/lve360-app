// app/api/stripe/checkout/route.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import Stripe from "stripe";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

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

    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });

    // --- AUTH ---
    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // --- REQUEST BODY ---
    const { plan } = await req.json().catch(() => ({}));
    if (!plan) {
      return NextResponse.json({ error: "Missing plan" }, { status: 400 });
    }

    // --- DETERMINE PRICE ---
    let priceId: string;
    if (plan === "monthly") priceId = priceMonthly;
    else if (plan === "annual") priceId = priceAnnual;
    else
      return NextResponse.json(
        { error: "Invalid plan. Must be 'monthly' or 'annual'." },
        { status: 400 }
      );

    const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

    // --- STRIPE CHECKOUT SESSION ---
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: user.email ?? undefined,
      metadata: {
        plan,
        user_id: user.id,
      },
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
