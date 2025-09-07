// app/api/stacks/route.ts

import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const queryParams = new URLSearchParams();

  // Transform plain ?user_id=abc into ?user_id=eq.abc for Supabase
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
