import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  return NextResponse.json({ ok: true, message: "Test-health POST works!" });
}

export async function GET(request: Request) {
  return NextResponse.json({ ok: true, message: "Test-health GET works!" });
}
