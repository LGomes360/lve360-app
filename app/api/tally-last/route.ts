import { NextResponse } from 'next/server';
import { assertEnv } from '../../../src/lib/env';

/**
 * GET /api/tally-last
 * Returns the latest Tally submission (payload_version, payload_json only).
 * Read-only, no user_id or writes needed.
 */
export async function GET() {
  assertEnv();

  // Prepare query: get only the latest row
  const q = new URLSearchParams({
    select: 'payload_version,payload_json',
    order: 'created_at.desc',
    limit: '1',
  });
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/submissions?${q}`;
  const resp = await fetch(url, {
    headers: {
      'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
      'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
    }
  });
  if (!resp.ok) {
    return NextResponse.json({ ok: false, error: 'Failed to fetch submissions' }, { status: resp.status });
  }
  const rows = await resp.json();
  return NextResponse.json(rows?.[0] ?? {});
}
