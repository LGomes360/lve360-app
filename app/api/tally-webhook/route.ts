import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { TALLY_KEYS, NormalizedSubmissionSchema } from '@/types/tally-normalized';
import { parseList, parseSupplements } from '@/lib/parseLists';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getAdmin() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

// -- [Utility functions unchanged, omitted for brevity] -- //

export async function POST(req: NextRequest) {
  const admin = getAdmin();
  let body: any;
  try {
    body = await req.json();
    console.log('[Webhook DEBUG] Incoming body:', JSON.stringify(body, null, 2));
  } catch (err) {
    console.error('[Webhook] Invalid JSON:', err);
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  try {
    // ...normalization logic as before...

    // Validate & Insert
    const parsed = NormalizedSubmissionSchema.safeParse(normalized);
    if (!parsed.success) {
      console.error('[Webhook DEBUG] Validation error:', JSON.stringify(parsed.error.flatten(), null, 2));
      await admin.from('webhook_failures').insert({
        source: 'tally',
        event_type: body?.eventType ?? body?.event_type ?? null,
        event_id: body?.eventId ?? body?.event_id ?? null,
        error_message: `validation_error: ${JSON.stringify(parsed.error.flatten())}`,
        severity: 'error',
        payload_json: body,
      });
      return NextResponse.json({ ok: false, error: 'Validation failed' }, { status: 422 });
    }
    const data = parsed.data;

    // -- FIND OR CREATE USER_ID --
    let userId: string | undefined = undefined;
    if (data.user_email) {
      const { data: userRow, error: userErr } = await admin
        .from('users')
        .select('id')
        .eq('email', data.user_email)
        .maybeSingle();

      if (userErr) console.error('[Webhook DEBUG] User lookup error:', userErr);

      if (userRow && userRow.id) {
        userId = userRow.id;
      } else {
        const { data: newUser, error: newUserErr } = await admin
          .from('users')
          .insert({ email: data.user_email })
          .select('id')
          .single();
        if (newUser && newUser.id) userId = newUser.id;
        if (newUserErr) console.error('[Webhook DEBUG] User creation error:', newUserErr);
      }
    }

    // Insert Submission — always with user_id
    const { data: subRow, error: subErr } = await admin
      .from('submissions')
      .insert({
        user_id: userId ?? null,
        user_email: data.user_email,
        name: data.name,
        dob: data.dob,
        height: data.height,
        weight: data.weight,
        sex: data.sex,
        gender: data.gender,
        pregnant: data.pregnant,
        goals: data.goals,
        skip_meals: data.skip_meals,
        energy_rating: data.energy_rating,
        sleep_rating: data.sleep_rating,
        allergies: data.allergies,
        conditions: data.conditions,
        medications: data.medications,
        supplements: data.supplements,
        hormones: data.hormones,
        dosing_pref: data.dosing_pref,
        brand_pref: data.brand_pref,
        payload_json: body,
        answers: answersPayload,
      })
      .select('id')
      .single();

    if (subErr || !subRow) {
      console.error('[Webhook DEBUG] DB insert error:', subErr, JSON.stringify(data, null, 2));
      await admin.from('webhook_failures').insert({
        source: 'tally',
        event_type: body?.eventType ?? body?.event_type ?? null,
        event_id: body?.eventId ?? body?.event_id ?? null,
        error_message: `insert_submission_error: ${subErr?.message}`,
        severity: 'critical',
        payload_json: body,
      });
      return NextResponse.json({ ok: false, error: 'DB insert failed' }, { status: 500 });
    }

    const submissionId = subRow.id;

    // ---------- INSERT CHILD TABLES HERE IF NEEDED -----------
    // Example: submission_supplements, submission_medications, etc.
    // Pass user_id into all child inserts as well!

    return NextResponse.json({ ok: true, submission_id: submissionId });
  } catch (err) {
    console.error('[Webhook Fatal Error]', err, body ? JSON.stringify(body, null, 2) : '');
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
