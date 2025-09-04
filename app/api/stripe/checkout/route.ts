import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: NextRequest) {
  const { email } = await req.json();
  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer_email: email,
      line_items: [{ price: process.env.STRIPE_PRICE_ID!, quantity: 1 }],
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/results?status=success&email=${encodeURIComponent(email)}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/pricing?email=${encodeURIComponent(email)}`,
    });
    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error('❌ Stripe checkout error:', err?.message || err);
    return NextResponse.json({ error: err?.message || 'checkout-error' }, { status: 500 });
  }
}
