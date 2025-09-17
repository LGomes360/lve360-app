// app/api/stripe/checkout/route.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import Stripe from "stripe";

export async function POST(req: NextRequest) {
  try {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    const pricePremium = process.env.STRIPE_PRICE_PREMIUM;
    const pricePro = process.env.STRIPE_PRICE_PRO;

    if (!stripeKey || !pricePremium) {
      return NextResponse.json({ error: "Stripe envs missing (STRIPE_SECRET_KEY or STRIPE_PRICE_PREMIUM)." }, { status: 500 });
    }

    // Use the Stripe API version matching installed types
    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });

    const body = await req.json().catch(() => ({}));
    const priceId = body.tier === "pro" ? (pricePro ?? pricePremium) : pricePremium;

    const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "/";

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${APP_URL}?success=1`,
      cancel_url: `${APP_URL}?canceled=1`,
    });

    return NextResponse.json({ ok: true, session });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 500 });
  }
}
