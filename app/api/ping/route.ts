// app/api/ping/route.ts
import { NextResponse } from 'next/server';

/**
 * Simple health check endpoint for API uptime monitoring.
 * Does not require or return any user data.
 */
export function GET() {
  return NextResponse.json({ ok: true, msg: 'pong' });
}

