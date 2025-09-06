// app/api/env-check/route.ts
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const required = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];

  const present = required.filter((k) => !!process.env[k]);
  const missing = required.filter((k) => !process.env[k]);

  return NextResponse.json({
    ok: missing.length === 0,
    present,
    missing,
    // never echo secret values
  });
}
