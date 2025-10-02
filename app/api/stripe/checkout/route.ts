// app/api/stripe/checkout/route.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import Stripe from "stripe";

export async function POST(req: NextRequest) {
  try {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    const pricePremium = process.env.STRIPE_PRICE_PREMIUM;
    const priceConcierge = process.env.STRIPE_PRICE_CONCIERGE;

    if (!stripeKey || !pricePremium) {
      return NextResponse.json(
        { error: "Stripe envs missing (STRIPE_SECRET_KEY, STRIPE_PRICE_PREMIUM)." },
        { status: 500 }
      );
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });

    const body = await req.json().catch(() => ({}));
    const { email, plan } = body;

    // Decide price based on plan
    let priceId = pricePremium;
    if (plan === "concierge" && priceConcierge) {
      priceId = priceConcierge;
    }

    const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: email,
      success_url: `${APP_URL}/dashboard?success=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${APP_URL}/pricing?canceled=1`,
    });

    // Return the URL directly so frontend can redirect
    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error("Stripe checkout error:", err);
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 500 });
  }
}
