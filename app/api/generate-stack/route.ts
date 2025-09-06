// app/api/generate-stack/route.ts
import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
export async function POST() {
  return NextResponse.json({ ok: true, stub: true });
}
