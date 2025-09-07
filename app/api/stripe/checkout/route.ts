// app/api/stripe/checkout/route.ts

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// Central place to map plan name → Stripe Price ID
const PRICE_MAP: Record<string, string | undefined> = {
  premium: process.env.STRIPE_PRICE_PREMIUM, // e.g., price_123
  pro: process.env.STRIPE_PRICE_PRO,         // add more plans as needed
};

function getPriceId(plan: string): string {
  const key = (plan || 'premium').toLowerCase();
  const price = PRICE_MAP[key];
  if (!price) throw new Error(`No Stripe price configured for plan "${key}".`);
  return price;
}

/**
 * POST /api/stripe/checkout
 * Starts a Stripe Checkout session for a given plan/email.
 * No user_id logic needed — handled on webhook.
 */
export async function POST(req: NextRequest) {
  // Allow plan from body or query string
  const { email, plan: planFromBody } = await req.json().catch(() => ({}));
  const planFromQuery = req.nextUrl.searchParams.get('plan') || undefined;
  const plan = (planFromBody || planFromQuery || 'premium').toLowerCase();

  if (!email) {
    return NextResponse.json({ error: 'Missing email' }, { status: 400 });
  }

  const APP_URL = process.env.NEXT_PUBLIC_APP_URL;
  if (!APP_URL) {
    return NextResponse.json({ error: 'Missing NEXT_PUBLIC_APP_URL' }, { status: 500 });
  }

  let priceId: string;
  try {
    priceId = getPriceId(plan);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Unknown plan' }, { status: 400 });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer_email: email,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${APP_URL}/results?status=success&plan=${encodeURIComponent(plan)}&email=${encodeURIComponent(
        email
      )}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${APP_URL}/pricing?plan=${encodeURIComponent(plan)}&email=${encodeURIComponent(email)}`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error('❌ Stripe checkout error:', err?.message || err);
    return NextResponse.json({ error: err?.message || 'checkout-error' }, { status: 500 });
  }
}
