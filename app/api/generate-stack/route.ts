import { NextResponse } from 'next/server';

export async function POST() {
  // fetch latest submission
  const q = new URLSearchParams({ select: '*', order: 'created_at.desc', limit: '1' });
  const subResp = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/submissions?${q}`, {
    headers: {
      'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}`
    }
  });

  if (!subResp.ok) return NextResponse.json({ ok:false, error:'no submission' }, { status:400 });
  const [sub] = await subResp.json();
  if (!sub) return NextResponse.json({ ok:false, error:'no submission' }, { status:400 });

  const fakeStack = {
    recommendations: [
      { name:'Creatine Monohydrate', dose:'5g daily', rationale:'Strength & cognition' },
      { name:'Glycine', dose:'3g nightly', rationale:'Sleep support' }
    ],
    warnings: [],
    meta: { version: 1 }
  };

  const ins = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/stacks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}`,
      'Prefer': 'return=representation'
    },
    body: JSON.stringify([{
      user_email: sub.user_email,
      submission_id: sub.id,
      stack: fakeStack
    }])
  });

  if (!ins.ok) return NextResponse.json({ ok:false, error: await ins.text() }, { status:500 });
  return NextResponse.json({ ok:true });
}
