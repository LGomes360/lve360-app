// app/api/tally-webhook/route.ts

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

// Supabase Admin Client
function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const fields = body?.data?.fields ?? [];
    const extract = (label: string) => {
      const entry = fields.find(
        (f: any) => f?.label?.toLowerCase()?.includes(label.toLowerCase())
      );
      if (!entry) return null;

      if (Array.isArray(entry.value)) {
        // Handle dropdowns or checkboxes
        if (entry.options) {
          return entry.value.map((val: string) => {
            const match = entry.options.find((opt: any) => opt.id === val);
            return match?.text ?? val;
          });
        }
        return entry.value;
      }

      if (entry.type === 'INPUT_EMAIL') return entry.value?.toLowerCase() ?? null;
      return entry.value ?? null;
    };

    const submission = {
      user_email: extract('Email Address'),
      name: extract('Name or Nickname'),
      dob: extract('Date of Birth'),
      height: extract('Height'),
      weight: extract('Weight (lbs)'),
      sex: extract('Sex at Birth'),
      gender: extract('Gender Identity'),
      pregnant: extract('Pregnancy/Breastfeeding'),
      goals: extract('What are your top health goals'),
      skip_meals: extract('Do you skip meals'),
      energy_rating: extract('rate your energy'),
      sleep_rating: extract('rate your sleep'),
      allergies: extract('allergies or sensitivities'),
      allergy_details: extract('What are you allergic to'),
      conditions: extract('current health conditions'),
      meds_flag: extract('take any medications'),
      medications: extract('List Medication'),
      supplements_flag: extract('take any supplements'),
      supplements: extract('List Supplements'),
      hormones_flag: extract('compounded hormones'),
      hormones: extract('List Hormones'),
      dosing_pref: extract('realistic for your lifestyle'),
      brand_pref: extract('supplements, do you prefer'),
      answers: JSON.stringify(fields),
      raw_payload: body,
    };

    // Validate required fields
    if (!submission.user_email) {
      console.error('[Validation Error] Missing user_email');
      return NextResponse.json(
        { ok: false, error: 'Missing required field: user_email' },
        { status: 400 }
      );
    }

    const supabase = supabaseAdmin();
    const { error } = await supabase.from('submissions').insert(submission);

    if (error) {
      console.error('[Supabase Insert Error]', error);
      return NextResponse.json({ ok: false, error }, { status: 500 });
    }

    return NextResponse.json({ ok: true, received: submission.user_email });
  } catch (err: any) {
    console.error('[Webhook Error]', err);
    return NextResponse.json(
      { ok: false, error: err.message ?? 'Unknown error' },
      { status: 500 }
    );
  }
}
