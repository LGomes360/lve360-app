import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import Stripe from "stripe";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = false;

export async function POST(req: NextRequest) {
  try {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    const priceMonthly = process.env.STRIPE_PRICE_PREMIUM;
    const priceAnnual = process.env.STRIPE_PRICE_ANNUAL;
    const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

    if (!stripeKey || !priceMonthly || !priceAnnual) {
      return NextResponse.json(
        { error: "Missing Stripe envs (STRIPE_SECRET_KEY, STRIPE_PRICE_PREMIUM, STRIPE_PRICE_ANNUAL)" },
        { status: 500 }
      );
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" });

    const { plan } = await req.json().catch(() => ({}));
    if (!plan || !["monthly", "annual"].includes(plan)) {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }

    // Get current user (preferred source of truth for id/email)
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id || !user.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const priceId = plan === "monthly" ? priceMonthly : priceAnnual;

    // Instrumentation
    console.log("[checkout] creating session", {
      user_id: user.id,
      email: user.email,
      plan,
      priceId,
    });

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: user.email.toLowerCase(),
      client_reference_id: user.id,                 // ← helps correlate
      metadata: { plan, user_id: user.id },         // ← used by /confirm
      success_url: `${APP_URL}/upgrade/success?session_id={CHECKOUT_SESSION_ID}&just=1`,
      cancel_url: `${APP_URL}/upgrade?canceled=1`,
      allow_promotion_codes: true,
    });

    console.log("[checkout] session created", { id: session.id, url: session.url });
    return NextResponse.json({ ok: true, url: session.url });
  } catch (err: any) {
    console.error("❌ [checkout] error:", err);
    return NextResponse.json({ error: err?.message ?? "Unexpected error" }, { status: 500 });
  }
}
