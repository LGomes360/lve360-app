import { NextResponse } from 'next/server';
import { assertEnv } from '../../../src/lib/env';

export async function POST(req: Request) {
  assertEnv();
  // 1) Get latest submission (REST query)
  const q = new URLSearchParams({ select: '*', order: 'created_at.desc', limit: '1' });

  // ...rest of your handler...
}
  const subResp = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/submissions?${q}`, {
    headers: {
      'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}`
    }
  });
  if (!subResp.ok) return NextResponse.json({ ok:false, error:'no submission' }, { status:400 });
  const [sub] = await subResp.json();
  if (!sub) return NextResponse.json({ ok:false, error:'no submission' }, { status:400 });

  // 2) Build placeholder stack (replace with real AI soon)
  const fakeStack = {
    recommendations: [
      { name:'Creatine Monohydrate', dose:'5g daily', rationale:'Strength & cognition' },
      { name:'Glycine', dose:'3g nightly', rationale:'Sleep support' }
    ],
    warnings: [],
    meta: { version: 1 }
  };

  // 3) Insert into stacks
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
