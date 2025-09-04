export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPA_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(req: NextRequest) {
  const emailRaw = req.nextUrl.searchParams.get('email') || '';
  const email = emailRaw.trim().toLowerCase();

  if (!email) {
    return NextResponse.json({ error: 'missing email' }, { status: 400 });
  }

  const url =
    `${SUPA_URL}/rest/v1/users` +
    `?select=tier,stripe_subscription_status,email` +
    `&email=eq.${encodeURIComponent(email)}` +
    `&limit=1`;

  const r = await fetch(url, {
    headers: {
      apikey: SUPA_SERVICE,
      Authorization: `Bearer ${SUPA_SERVICE}`,
    },
    cache: 'no-store',
  });

  if (!r.ok) {
    const txt = await r.text();
    console.error('users/tier fetch failed:', txt);
    return NextResponse.json({ error: 'db-error' }, { status: 500 });
  }

  const rows = await r.json();
  const row = Array.isArray(rows) ? rows[0] : null;

  return NextResponse.json({
    email,
    tier: (row?.tier as 'free' | 'premium') ?? 'free',
    stripe_subscription_status: row?.stripe_subscription_status ?? null,
  });
}
