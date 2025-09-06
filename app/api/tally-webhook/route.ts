// app/api/tally-webhook/route.ts

import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const answers = body?.form_response?.answers ?? [];

    const extract = (label: string) => {
      const a = answers.find((x) => x?.field?.label?.toLowerCase() === label.toLowerCase());
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
      email: extract('Email Address'),
      name: extract('Name or Nickname'),
      dob: extract('Date of Birth'),
      height: extract('Height'),
      weight: extract('Weight (lbs)'),
      sex: extract('Sex at Birth'),
      gender: extract('Gender Identity (Optional)'),
      pregnant: extract('Pregnancy/Breastfeeding'),
      goals: extract('What are your top health goals'),
      skip_meals: extract('Do you skip meals?'),
      energy_rating: extract('How would you rate your energy on a typical day?'),
      sleep_rating: extract('How would you rate your sleep?'),
      allergies: extract('Do you have any allergies or sensitivities?'),
      allergy_details: extract('What are you allergic to?'),
      conditions: extract('Do you have any current health conditions?'),
      meds_flag: extract('Do you take any medications?'),
      medications: extract('List Medication'),
      supplements_flag: extract('Do you take any supplements?'),
      supplements: extract('List Supplements'),
      hormones_flag: extract('Do you take any compounded hormones?'),
      hormones: extract('List Hormones'),
      dosing_pref: extract('What is realistic for your lifestyle?'),
      brand_pref: extract('When it comes to supplements, do you prefer...'),
      raw_payload: body
    };

    const { error } = await supabase.from('submissions').insert(submission);

    if (error) {
      console.error('[Supabase]', error);
      return NextResponse.json({ ok: false, error }, { status: 500 });
    }

    return NextResponse.json({ ok: true, received: submission.email });
  } catch (err) {
    console.error('[Webhook Error]', err);
    return NextResponse.json({ ok: false, error: err }, { status: 500 });
  }
}
