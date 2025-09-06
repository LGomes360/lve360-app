// app/api/tally-webhook/route.ts

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

// Supabase Admin Client (server-only)
function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    console.log('[Raw Payload]', JSON.stringify(body, null, 2));
    const answers = body?.data?.fields ?? body?.form_response?.answers ?? [];
        // Extract by field key instead of label
    const extract = (key: string) => {
      const a = answers.find((x: any) => x?.field?.key === key);
      console.log('[Answers]', JSON.stringify(answers, null, 2));
      if (!a) return null;
      if (a.type === 'choices') return a.choices?.labels ?? [];
      if (a.type === 'choice') return a.choice?.label ?? null;
      if (a.type === 'email') return a.email;
      if (a.type === 'text') return a.text;
      if (a.type === 'number') return a.number;
      if (a.type === 'date') return a.date;
      return a[a.type] ?? null;
    };

    const submission = {
      user_email: extract('question_7K5g10'),
      name: extract('question_a4oPKX'),
      dob: extract('question_2KO5bg'),
      height: extract('question_Pzk8r1'),
      weight: extract('question_O7k8ka'),
      sex: extract('question_vDbvEl'),
      gender: extract('question_xJ9B0E'),
      pregnant: extract('question_RD8lZQ'),
      goals: extract('question_o2lQ0N'),
      skip_meals: extract('question_ElYrZB'),
      energy_rating: extract('question_GpyjqL'),
      sleep_rating: extract('question_O78yjM'),
      allergies: extract('question_KxyNWX'),
      allergy_details: extract('question_o2l8rV'),
      conditions: extract('question_7K5Yj6'),
      meds_flag: extract('question_Vzoy96'),
      medications: extract('question_Ex8YB2'),
      supplements_flag: extract('question_Bx8JON'),
      supplements: extract('question_kNO8DM'),
      hormones_flag: extract('question_Ex87zN'),
      hormones: extract('question_ro2Myv'),
      dosing_pref: extract('question_vDbapX'),
      brand_pref: extract('question_LKyjgz'),
      answers: JSON.stringify(answers ?? []),
      raw_payload: body,
    };

    const supabase = supabaseAdmin();
    const { error } = await supabase.from('submissions').insert(submission);

    if (error) {
      console.error('[Supabase Insert Error]', error);
      return NextResponse.json({ ok: false, error }, { status: 500 });
    }

    return NextResponse.json({ ok: true, received: submission.user_email });
  } catch (err: any) {
    console.error('[Webhook Error]', err);
    return NextResponse.json({ ok: false, error: err.message || 'Unknown error' }, { status: 500 });
  }
}
