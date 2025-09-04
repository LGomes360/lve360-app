// app/api/stripe/checkout/route.ts
import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// Central place to map plan -> Stripe Price ID (from env)
const PRICE_MAP: Record<string, string | undefined> = {
  premium: process.env.STRIPE_PRICE_PREMIUM, // e.g., price_123
  pro: process.env.STRIPE_PRICE_PRO,         // optional, add later
  // starter: process.env.STRIPE_PRICE_STARTER, // example if you add more
};

function getPriceId(plan: string): string {
  const key = (plan || 'premium').toLowerCase();
  const price = PRICE_MAP[key];
  if (!price) throw new Error(`No Stripe price configured for plan "${key}".`);
  return price;
}

export async function POST(req: NextRequest) {
  // Body can be { email, plan? }, we also allow ?plan=.. in the URL
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
      // you can add trial_period_days to the price in Stripe if you want trials
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
