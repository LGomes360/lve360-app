import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const url = new URL(req.url);
  // Pass through any query params (select, order, limit)
  const qp = url.searchParams.toString();
  const resp = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/stacks?${qp}`, {
    headers: {
      'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}`
    }
  });
  const data = await resp.json();
  return NextResponse.json(data);
}
