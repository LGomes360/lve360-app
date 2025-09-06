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
    const answers = body?.form_response?.answers ?? [];

    const extract = (label: string) => {
      const a = answers.find(
        (x: any) => x?.field?.label?.toLowerCase().includes(label.toLowerCase())
      );
      if (!a) return null;
      if (a.type === 'choices') return a.choices?.labels ?? [];
      if (a.type === 'choice') return a.choice?.label ?? null;
      if (a.type === 'email') return a.email;
      if (a.type === 'text') return a.text;
      if (a.type === 'number') return a.number;
      if (a.type === 'date') return a.date;
      return a[a.type] ?? null;
    };

    // Map incoming answers to Supabase columns
    const submission = {
      user_email: extract('Email'), // 🟢 maps to NOT NULL column in Supabase
      name: extract('Name'),
      dob: extract('Birth'),
      height: extract('Height'),
      weight: extract('Weight'),
      sex: extract('Sex'),
      gender: extract('Gender'),
      pregnant: extract('Pregnancy'),
      goals: extract('goals'),
      skip_meals: extract('skip meals'),
      energy_rating: extract('energy'),
      sleep_rating: extract('sleep'),
      allergies: extract('allergies'),
      allergy_details: extract('allergic to'),
      conditions: extract('conditions'),
      meds_flag: extract('medications?'),
      medications: extract('List Medication'),
      supplements_flag: extract('supplements?'),
      supplements: extract('List Supplements'),
      hormones_flag: extract('compounded hormones?'),
      hormones: extract('List Hormones'),
      dosing_pref: extract('realistic for your lifestyle'),
      brand_pref: extract('prefer'),
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
