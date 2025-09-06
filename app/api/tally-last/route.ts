import { NextResponse } from 'next/server';
import { assertEnv } from '../../../src/lib/env';

export async function GET() {
  // Ensure required environment variables are set
  assertEnv();
  // Build query params: select payload_version and payload_json, order by created_at desc, limit 1
  const q = new URLSearchParams({ select: 'payload_version,payload_json', order: 'created_at.desc', limit: '1' });
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/submissions?${q}`;
  const resp = await fetch(url, {
    headers: {
      'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
      'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`
    }
  });
  if (!resp.ok) {
    return NextResponse.json({ ok: false, error: 'Failed to fetch submissions' }, { status: resp.status });
  }
  const rows = await resp.json();
  // Return the first (latest) row or empty object
  return NextResponse.json(rows?.[0] ?? {});
}
