// app/api/stacks/route.ts

import { NextResponse } from 'next/server';

/**
 * GET /api/stacks
 * Supports ?user_id=, ?select=, ?order=, ?limit= as query params.
 * Fetches stacks (filtered via Supabase REST API).
 * Does not write or upsert data; only reads.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const queryParams = new URLSearchParams();

  // Transform ?user_id=abc → ?user_id=eq.abc (Supabase REST API expects this)
  for (const [key, value] of url.searchParams.entries()) {
    if (['select', 'order', 'limit'].includes(key)) {
      queryParams.set(key, value);
    } else {
      queryParams.set(key, `eq.${value}`);
    }
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const resp = await fetch(`${supabaseUrl}/rest/v1/stacks?${queryParams.toString()}`, {
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`
    }
  });

  const data = await resp.json();
  return NextResponse.json(data);
}
