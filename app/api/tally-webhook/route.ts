import { NextRequest, NextResponse } from 'next/server';

export function GET() {
  return NextResponse.json({ ok: true, msg: 'tally-webhook ready' });
}

export async function POST(req: NextRequest) {
  // Bearer token check
  const auth = req.headers.get('authorization') || '';
  const token = auth.replace('Bearer ', '').trim();
  if (token !== process.env.TALLY_WEBHOOK_SECRET) {
    return NextResponse.json({ ok:false, error:'unauthorized' }, { status:401 });
  }

  try {
    const payload = await req.json();

    // normalize common Tally shapes
    const answers: any = payload?.answers ?? payload?.data ?? payload ?? {};
    const pick = (k: string) =>
      answers?.[k] ??
      answers?.[k?.toLowerCase?.() ?? k] ??
      answers?.fields?.find?.((f: any) => (f.key||'').toLowerCase() === k)?.value;

    const email = String(pick('email') || 'unknown@unknown.com').toLowerCase();
    const utm = {
      source: pick('utm_source') || null,
      medium: pick('utm_medium') || null,
      campaign: pick('utm_campaign') || null
    };

    // Write via Supabase REST (no SDK)
    const resp = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/submissions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}`,
        'Prefer': 'return=representation'
      },
      body: JSON.stringify([{ user_email: email, utm, answers }])
    });

    if (!resp.ok) {
      return NextResponse.json({ ok:false, error: await resp.text() }, { status:500 });
    }
    return NextResponse.json({ ok:true });
  } catch (e: any) {
    return NextResponse.json({ ok:false, error: e?.message || 'parse error' }, { status:400 });
  }
}
