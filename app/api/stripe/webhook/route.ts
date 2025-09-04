// app/api/stripe/webhook/route.ts
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

// --- Stripe client (no version pin needed) ---
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// --- Supabase REST details (server-only) ---
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPA_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Normalize emails to avoid duplicates like "User@Gmail.com"
function normalize(email: string | null | undefined): string {
  return (email ?? '').toString().trim().toLowerCase();
}

// Upsert a user by email into Supabase (sets tier + stripe fields)
// Upsert a user by email into Supabase (sets tier + stripe fields)
async function upsertUser(row: {
  email: string;
  tier: 'free' | 'premium';
  stripe_customer_id?: string | null;
  stripe_subscription_status?: string | null;
}) {
  const payload = [{
    email: (row.email ?? '').trim().toLowerCase(),
    tier: row.tier,
    stripe_customer_id: row.stripe_customer_id ?? null,
    stripe_subscription_status: row.stripe_subscription_status ?? null,
    updated_at: new Date().toISOString(),
  }];

  // NOTE: on_conflict=email is required for PostgREST to upsert on the email column
  const resp = await fetch(`${SUPA_URL}/rest/v1/users?on_conflict=email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPA_SERVICE,
      'Authorization': `Bearer ${SUPA_SERVICE}`,
      'Prefer': 'resolution=merge-duplicates'
    },
    body: JSON.stringify(payload)
  });

  if (!resp.ok) {
    console.error('❌ Supabase upsert failed:', await resp.text());
  } else {
    console.log('✅ Supabase upsert ok for', payload[0].email, '→ tier:', row.tier);
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
    // 1) Checkout completed → mark as premium/active
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const email = normalize(session.customer_email);
      const customerId =
        typeof session.customer === 'string'
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

    // 2) Subscription status changed → sync tier
    if (event.type === 'customer.subscription.updated') {
      const sub = event.data.object as Stripe.Subscription;
      const customerId =
        typeof sub.customer === 'string'
          ? sub.customer
          : sub.customer?.id || null;

      let email = '';
      if (customerId) {
        const cust = await stripe.customers.retrieve(customerId);
        email = normalize((cust as Stripe.Customer).email);
      }

      const status = sub.status; // active, past_due, canceled, incomplete, etc.
      const tier = status === 'active' ? 'premium' : 'free';
      console.log('ℹ️ Subscription updated:', sub.id, email, '→', status);

      if (email) {
        await upsertUser({
          email,
          tier,
          stripe_customer_id: customerId,
          stripe_subscription_status: status
        });
      }
    }

    // 3) Subscription deleted → mark as free/canceled
    if (event.type === 'customer.subscription.deleted') {
      const sub = event.data.object as Stripe.Subscription;
      const customerId =
        typeof sub.customer === 'string'
          ? sub.customer
          : sub.customer?.id || null;

      let email = '';
      if (customerId) {
        const cust = await stripe.customers.retrieve(customerId);
        email = normalize((cust as Stripe.Customer).email);
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
