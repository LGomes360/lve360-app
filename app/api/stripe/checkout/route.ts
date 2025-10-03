// app/api/stripe/checkout/route.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import Stripe from "stripe";

export async function POST(req: NextRequest) {
  try {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    const pricePremium = process.env.STRIPE_PRICE_PREMIUM;
    const priceConcierge = process.env.STRIPE_PRICE_CONCIERGE;

    if (!stripeKey || !pricePremium || !priceConcierge) {
      return NextResponse.json(
        { error: "Missing Stripe envs (STRIPE_SECRET_KEY, STRIPE_PRICE_PREMIUM, STRIPE_PRICE_CONCIERGE)" },
        { status: 500 }
      );
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });

    const body = await req.json().catch(() => ({}));
    const { plan, email } = body;

    if (!plan || !email) {
      return NextResponse.json(
        { error: "Missing required fields (plan, email)" },
        { status: 400 }
      );
    }

    // Decide which plan
    const priceId = plan === "concierge" ? priceConcierge : pricePremium;
    const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: email, // ensures Stripe ties checkout to the user
      metadata: { plan }, // 🔑 Pass plan so webhook can set correct tier

      // Supabase callback → then forward to dashboard
      success_url: `${APP_URL}/auth/callback?next=/dashboard&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${APP_URL}/pricing?canceled=1`,
    });

    return NextResponse.json({ ok: true, url: session.url });
  } catch (err: any) {
    console.error("Stripe checkout error:", err);
    return NextResponse.json(
      { error: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}
