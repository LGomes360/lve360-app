export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

// Stripe client (no version pin needed)
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// Supabase (server-only) details
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPA_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Upsert a user by email into Supabase (sets tier + stripe fields)
async function upsertUser(row: {
  email: string;
  tier: 'free' | 'premium';
  stripe_customer_id?: string | null;
  stripe_subscription_status?: string | null;
}) {
  const resp = await fetch(`${SUPA_URL}/rest/v1/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPA_SERVICE,
      'Authorization': `Bearer ${SUPA_SERVICE}`,
      'Prefer': 'resolution=merge-duplicates'
    },
    body: JSON.stringify([{
      email: row.email.toLowerCase(),
      tier: row.tier,
      stripe_customer_id: row.stripe_customer_id ?? null,
      stripe_subscription_status: row.stripe_subscription_status ?? null,
      updated_at: new Date().toISOString()
    }])
  });

  if (!resp.ok) {
    console.error('❌ Supabase upsert failed:', await resp.text());
  } else {
    console.log('✅ Supabase upsert ok for', row.email, '→ tier:', row.tier);
  }
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const sig = req.headers.get('stripe-signature')!;
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET!;

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig, endpointSecret);
  } catch (err: any) {
    return NextResponse.json({ error: `Webhook error: ${err.message}` }, { status: 400 });
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const email = (session.customer_email || '').toLowerCase();
      const customerId = typeof session.customer === 'string'
        ? session.customer
        : session.customer?.id || null;

      console.log('✅ Checkout completed for', email);
      if (email) {
        await upsertUser({
          email,
          tier: 'premium',
          stripe_customer_id: customerId,
          stripe_subscription_status: 'active'
        });
      }
    }

    if (event.type === 'customer.subscription.deleted') {
      const sub = event.data.object as Stripe.Subscription;
      const customerId = typeof sub.customer === 'string'
        ? sub.customer
        : sub.customer?.id || null;

      // look up the email for this customer
      let email = '';
      if (customerId) {
        const cust = await stripe.customers.retrieve(customerId);
        email = (cust as Stripe.Customer).email?.toLowerCase() || '';
      }

      console.log('❌ Subscription canceled:', sub.id, email);
      if (email) {
        await upsertUser({
          email,
          tier: 'free',
          stripe_customer_id: customerId,
          stripe_subscription_status: 'canceled'
        });
      }
    }

    return NextResponse.json({ received: true });
  } catch (e: any) {
    console.error('Webhook handler error:', e?.message || e);
    return NextResponse.json({ error: 'handler-error' }, { status: 500 });
  }
}
