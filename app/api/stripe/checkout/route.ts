// app/api/stripe/checkout/route.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import Stripe from "stripe";

export async function POST(req: NextRequest) {
  try {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    const pricePremium = process.env.STRIPE_PRICE_PREMIUM;
    const priceConcierge = process.env.STRIPE_PRICE_CONCIERGE; // renamed for clarity

    if (!stripeKey || !pricePremium || !priceConcierge) {
      return NextResponse.json(
        { error: "Missing Stripe envs (check STRIPE_SECRET_KEY, STRIPE_PRICE_PREMIUM, STRIPE_PRICE_CONCIERGE)" },
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

    const priceId = plan === "concierge" ? priceConcierge : pricePremium;

    const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "/";

const session = await stripe.checkout.sessions.create({
  mode: "subscription",
  payment_method_types: ["card"],
  line_items: [{ price: priceId, quantity: 1 }],
  customer_email: email, // keeps their email tied to Stripe + Supabase
  // ✅ always redirect through auth/callback to ensure a session is set
  success_url: `${APP_URL}/auth/callback?next=/dashboard`,
  cancel_url: `${APP_URL}/pricing?canceled=1`,
});


    return NextResponse.json({ ok: true, url: session.url });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}
