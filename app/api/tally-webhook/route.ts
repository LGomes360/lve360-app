import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ✅ Healthcheck: proves the route is live
export async function GET() {
  return NextResponse.json({ ok: true, msg: 'tally-webhook ready' });
}

// ✅ Tally POST handler (saves to Supabase)
export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.replace('Bearer ', '').trim();
  if (token !== process.env.TALLY_WEBHOOK_SECRET) {
    return NextResponse.json({ ok:false, error:'unauthorized' }, { status:401 });
  }

  try {
    const payload = await req.json();
    const answers: any = payload?.answers ?? payload?.data ?? payload ?? {};
    const find = (k: string) =>
      answers?.[k] ??
      answers?.[k.toLowerCase?.() ?? k] ??
      answers?.fields?.find?.((f: any) => (f.key||'').toLowerCase() === k)?.value;

    const email = String(find('email') || 'unknown@unknown.com').toLowerCase();
    const utm = {
      source: find('utm_source') || null,
      medium: find('utm_medium') || null,
      campaign: find('utm_campaign') || null,
    };

    const { error } = await supabase
      .from('submissions')
      .insert([{ user_email: email, utm, answers }]);

    if (error) return NextResponse.json({ ok:false, error: error.message }, { status:500 });
    return NextResponse.json({ ok:true });
  } catch (e: any) {
    return NextResponse.json({ ok:false, error: e?.message || 'parse error' }, { status:400 });
  }
}
