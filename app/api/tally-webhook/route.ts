// app/api/tally-webhook/route.ts

import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase'; // adjust if needed

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const answers = body?.form_response?.answers ?? [];

    const getAnswer = (ref: string) => {
      const match = answers.find((a) => a.field?.ref === ref);
      if (!match) return null;
      if (match.type === 'choices') return match.choices?.labels ?? [];
      if (match.type === 'choice') return match.choice?.label ?? null;
      if (match.type === 'email') return match.email;
      if (match.type === 'text') return match.text;
      if (match.type === 'number') return match.number;
      if (match.type === 'date') return match.date;
      return match[match.type] ?? null;
    };

    const submission = {
      email: getAnswer('email') || 'missing@example.com',
      name: getAnswer('name') || null,
      dob: getAnswer('dob') || null,
      height: getAnswer('height') || null,
      weight: getAnswer('weight') || null,
      sex: getAnswer('sex') || null,
      gender: getAnswer('gender') || null,
      goals: getAnswer('goals'),
      skip_meals: getAnswer('skip_meals'),
      energy_rating: getAnswer('energy_rating'),
      sleep_rating: getAnswer('sleep_rating'),
      allergies: getAnswer('allergies'),
      allergy_details: getAnswer('allergy_details'),
      health_conditions: getAnswer('conditions'),
      medications: getAnswer('medications'),
      supplements: getAnswer('supplements'),
      hormones: getAnswer('hormones'),
      dose_pref: getAnswer('dosing_pref'),
      brand_pref: getAnswer('brand_pref'),
      raw_payload: body
    };

    const { error } = await supabase
      .from('submissions')
      .insert(submission);

    if (error) {
      console.error('[Supabase error]', error);
      return NextResponse.json({ ok: false, error }, { status: 500 });
    }

    return NextResponse.json({ ok: true, received: submission.email });

  } catch (err) {
    console.error('[Webhook error]', err);
    return NextResponse.json({ ok: false, error: err }, { status: 500 });
  }
}
