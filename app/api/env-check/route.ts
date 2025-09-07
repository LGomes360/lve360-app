// app/api/env-check/route.ts
import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';

/**
 * Diagnostic API route: Checks if required env variables are present.
 * Never leaks secret values. Pass ?all=1 to see all env keys (names only).
 */

const DEFAULT_KEYS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_PRICE_PREMIUM',
  'STRIPE_WEBHOOK_SECRET',
];

export async function GET(req: Request) {
  const url = new URL(req.url);
  const showAll = url.searchParams.get('all') === '1';

  if (showAll) {
    // Lists all env var names present (no values).
    const names = Object.keys(process.env ?? {}).sort();
    // (Optional: add a Cache-Control header if you want)
    return NextResponse.json({ ok: true, keys_present: names });
  }

  const present: Record<string, boolean> = {};
  for (const k of DEFAULT_KEYS) present[k] = !!process.env[k];

  return NextResponse.json({ ok: Object.values(present).every(Boolean), present });
}
