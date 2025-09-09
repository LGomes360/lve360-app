export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPA_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(SUPA_URL, SUPA_SERVICE);

function normalize(email: string | null | undefined): string {
  return (email ?? '').trim().toLowerCase();
}

/**
 * Always returns the canonical user_id for the given email.
 * If submissions exist, uses submission.user_id; otherwise, returns null.
 */
async function getCanonicalUserIdByEmail(email: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('submissions')
    .select('user_id')
    .eq('user_email', email)
    .order('submitted_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) return null;
  return data.user_id;
}

/**
 * Upsert user by email. On insert, uses canonical_user_id if provided.
 */
async function upsertUser(row: {
  email: string;
  tier: 'free' | 'premium';
  stripe_customer_id?: string | null;
  stripe_subscription_status?: string | null;
  canonical_user_id?: string | null;
}) {
  const email = normalize(row.email);
  // Lookup existing user by normalized email
  const { data: existingUsers, error: lookupErr } = await supabase
    .from('users')
    .select('*')
    .eq('email', email);

  if (lookupErr) {
    console.error('Supabase user lookup failed:', lookupErr);
    return;
  }

  let idToUse = row.canonical_user_id || undefined;

  // If user exists, just update
  if (existingUsers && existingUsers.length > 0) {
    const user = existingUsers[0];
    const resp = await supabase
      .from('users')
      .update({
        tier: row.tier,
        stripe_customer_id: row.stripe_customer_id ?? user.stripe_customer_id,
        stripe_subscription_status: row.stripe_subscription_status ?? user.stripe_subscription_status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);
    if (resp.error) {
      console.error('❌ Supabase user update failed:', resp.error);
    } else {
      console.log('✅ Supabase user updated:', email, '→ tier:', row.tier);
    }
    return;
  }

  // If not found, insert with canonical user_id if provided
  const payload = [{
    id: idToUse, // undefined = auto-gen, else force
    email,
    tier: row.tier,
    stripe_customer_id: row.stripe_customer_id ?? null,
    stripe_subscription_status: row.stripe_subscription_status ?? null,
    updated_at: new Date().toISOString(),
  }];

  const resp = await fetch(`${SUPA_URL}/rest/v1/users`, {
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
    const msg = await resp.text();
    console.error('❌ Supabase user insert failed:', msg);
    // Try deduplication if duplicate error
    if (resp.status === 409 || msg.toLowerCase().includes('duplicate')) {
      await dedupeUserRowsByEmail(email);
    }
  } else {
    console.log('✅ Supabase user inserted for', email, '→ tier:', row.tier);
  }
}

/**
 * Deduplicate users table for a given email.
 * Keeps the canonical user_id (from submissions if possible).
 * Updates submissions/stacks, deletes extra users.
 */
async function dedupeUserRowsByEmail(email: string) {
  const emailNorm = normalize(email);
  const { data: users, error } = await supabase
    .from('users')
    .select('*')
    .eq('email', emailNorm);

  if (error || !users || users.length < 2) return; // Only dedupe if >1

  // Find canonical user_id (from submissions, else first user)
  let canonical_user_id = await getCanonicalUserIdByEmail(emailNorm);
  if (!canonical_user_id) canonical_user_id = users[0].id;

  const extras = users.filter(u => u.id !== canonical_user_id);
  const extraIds = extras.map(u => u.id);
  if (extraIds.length === 0) return;

  // Update submissions/stacks to point to canonical user_id
  await supabase
    .from('submissions')
    .update({ user_id: canonical_user_id })
    .in('user_id', extraIds);
  await supabase
    .from('stacks')
    .update({ user_id: canonical_user_id })
    .in('user_id', extraIds);

  // Delete extras
  await supabase
    .from('users')
    .delete()
    .in('id', extraIds);

  console.log(`✅ Deduped users for ${emailNorm}. Kept ${canonical_user_id}, removed: ${extraIds.join(', ')}`);
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
    // 1. Checkout session completed
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const email = normalize(session.customer_email);
      const customerId =
        typeof session.customer === 'string'
          ? session.customer
          : session.customer?.id || null;

      console.log('✅ Checkout completed for', email);
      if (email) {
        // Get canonical user_id from submissions if exists
        const canonical_user_id = await getCanonicalUserIdByEmail(email);
        await upsertUser({
          email,
          tier: 'premium',
          stripe_customer_id: customerId,
          stripe_subscription_status: 'active',
          canonical_user_id
        });
        await dedupeUserRowsByEmail(email);
      }
    }

    // 2. Subscription updated
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

      const status = sub.status; // e.g., 'active', 'past_due', 'canceled'
      const tier = status === 'active' ? 'premium' : 'free';
      console.log('ℹ️ Subscription updated:', sub.id, email, '→', status);

      if (email) {
        const canonical_user_id = await getCanonicalUserIdByEmail(email);
        await upsertUser({
          email,
          tier,
          stripe_customer_id: customerId,
          stripe_subscription_status: status,
          canonical_user_id
        });
        await dedupeUserRowsByEmail(email);
      }
    }

    // 3. Subscription deleted
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
        const canonical_user_id = await getCanonicalUserIdByEmail(email);
        await upsertUser({
          email,
          tier: 'free',
          stripe_customer_id: customerId,
          stripe_subscription_status: 'canceled',
          canonical_user_id
        });
        await dedupeUserRowsByEmail(email);
      }
    }

    return NextResponse.json({ received: true });
  } catch (e: any) {
    console.error('Webhook handler error:', e?.message || e);
    return NextResponse.json({ error: 'handler-error' }, { status: 500 });
  }
}
