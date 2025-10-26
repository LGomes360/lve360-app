// app/api/stripe/checkout/route.ts
import { NextResponse, type NextRequest } from "next/server";
import Stripe from "stripe";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2024-06-20" });

export async function POST(req: NextRequest) {
  try {
    // --- ENVIRONMENT VALIDATION ---
    const { STRIPE_PRICE_PREMIUM, STRIPE_PRICE_ANNUAL, NEXT_PUBLIC_APP_URL } = process.env;
    if (!process.env.STRIPE_SECRET_KEY || !STRIPE_PRICE_PREMIUM || !STRIPE_PRICE_ANNUAL || !NEXT_PUBLIC_APP_URL) {
      return NextResponse.json(
        { error: "Missing envs (STRIPE_SECRET_KEY, STRIPE_PRICE_PREMIUM, STRIPE_PRICE_ANNUAL, NEXT_PUBLIC_APP_URL)" },
        { status: 500 }
      );
    }

    // --- AUTH (prefer the signed-in user rather than trusting body email) ---
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // --- REQUEST BODY ---
    const { plan } = await req.json().catch(() => ({}));
    if (!plan || !["monthly", "annual"].includes(plan)) {
      return NextResponse.json({ error: "Invalid or missing plan ('monthly'|'annual')" }, { status: 400 });
    }

    // --- PRICE ---
    const priceId = plan === "monthly" ? STRIPE_PRICE_PREMIUM : STRIPE_PRICE_ANNUAL;

    // --- URLS ---
    const successUrl = `${NEXT_PUBLIC_APP_URL}/upgrade/success?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl  = `${NEXT_PUBLIC_APP_URL}/upgrade?canceled=1`;

    // --- CHECKOUT SESSION ---
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId!, quantity: 1 }],
      customer_email: user.email.toLowerCase(),
      metadata: { plan, user_id: user.id },
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    return NextResponse.json({ ok: true, url: session.url });
  } catch (err: any) {
    console.error("❌ Stripe checkout error:", err);
    return NextResponse.json({ error: err?.message ?? "Unexpected error" }, { status: 500 });
  }
}
