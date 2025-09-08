// -----------------------------------------------------------------------------
// LVE360 // Tally Webhook
// Handles incoming Tally form submissions, normalizes + validates data,
// creates (or finds) the canonical user, inserts the submission with user_id,
// optionally inserts child tables, logs errors to webhook_failures.
// -----------------------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { TALLY_KEYS, NormalizedSubmissionSchema } from '@/types/tally-normalized';
import { parseList, parseSupplements } from '@/lib/parseLists';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getAdmin() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

function normalizeEmail(email?: string): string | undefined {
  return email ? email.trim().toLowerCase() : undefined;
}

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
    // --- Merge fields from Tally ---
    const fieldsMap = body?.data?.fields ? Object.fromEntries(body.data.fields.map(f => [f.key, f.value])) : {};
    const answersMap = body?.form_response?.answers ? Object.fromEntries(body.form_response.answers.map(a => [a.field?.id ?? a.field?.key, a.value ?? a])) : {};
    const src = { ...fieldsMap, ...answersMap };

    // --- Normalize data for Zod validation ---
    const normalized = {
      user_email: normalizeEmail(src[TALLY_KEYS.user_email] as string),
      name: src[TALLY_KEYS.name] ?? null,
      dob: src[TALLY_KEYS.dob] ?? null,
      height: src[TALLY_KEYS.height] ?? null,
      weight: src[TALLY_KEYS.weight] ?? null,
      sex: src[TALLY_KEYS.sex] ?? null,
      gender: src[TALLY_KEYS.gender] ?? null,
      pregnant: src[TALLY_KEYS.pregnant] ?? null,
      goals: parseList(src[TALLY_KEYS.goals] ?? []),
      skip_meals: src[TALLY_KEYS.skip_meals] ?? null,
      energy_rating: src[TALLY_KEYS.energy_rating] ?? null,
      sleep_rating: src[TALLY_KEYS.sleep_rating] ?? null,
      allergies: parseList(src[TALLY_KEYS.allergies] ?? []),
      conditions: parseList(src[TALLY_KEYS.conditions] ?? []),
      medications: parseList(src[TALLY_KEYS.medications] ?? []),
      supplements: parseSupplements(src[TALLY_KEYS.supplements] ?? []),
      hormones: parseList(src[TALLY_KEYS.hormones] ?? []),
      dosing_pref: src[TALLY_KEYS.dosing_pref] ?? null,
      brand_pref: src[TALLY_KEYS.brand_pref] ?? null,
      tier: src[TALLY_KEYS.tier] ?? 'free', // fallback
    };

    console.log('[Webhook DEBUG] Normalized submission:', JSON.stringify(normalized, null, 2));

    // --- Validate via Zod ---
    const parsed = NormalizedSubmissionSchema.safeParse(normalized);
    if (!parsed.success) {
      await admin.from('webhook_failures').insert({
        source: 'tally',
        event_type: body?.eventType ?? null,
        event_id: body?.eventId ?? null,
        error_message: JSON.stringify(parsed.error.flatten()),
        severity: 'error',
        payload_json: body,
      });
      return NextResponse.json({ ok: false, error: 'Validation failed' }, { status: 422 });
    }

    const data = parsed.data;

    // --- Find or create canonical user ---
    let userId: string;
    const normalizedEmail = normalizeEmail(data.user_email);
    const { data: userRow } = await admin
      .from('users')
      .select('id, tier')
      .eq('email', normalizedEmail)
      .maybeSingle();

    if (userRow) {
      userId = userRow.id;
      // Upgrade tier if necessary
      if (userRow.tier !== 'premium' && data.tier === 'premium') {
        await admin.from('users').update({ tier: 'premium' }).eq('id', userId);
      }
    } else {
      const { data: newUser } = await admin.from('users')
        .insert({ email: normalizedEmail, tier: data.tier ?? 'free' })
        .select('id')
        .single();
      userId = newUser.id;
    }

    // --- Insert submission ---
    const answersPayload =
      body?.data?.fields && Array.isArray(body.data.fields) ? body.data.fields :
      body?.form_response?.answers && Array.isArray(body.form_response.answers) ? body.form_response.answers :
      [];

    const { data: subRow, error: subErr } = await admin.from('submissions')
      .insert({
        user_id: userId,
        user_email: normalizedEmail,
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
      await admin.from('webhook_failures').insert({
        source: 'tally',
        event_type: body?.eventType ?? null,
        event_id: body?.eventId ?? null,
        error_message: `insert_submission_error: ${subErr?.message}`,
        severity: 'critical',
        payload_json: body,
      });
      return NextResponse.json({ ok: false, error: 'DB insert failed' }, { status: 500 });
    }

    const submissionId = subRow.id;

    return NextResponse.json({ ok: true, submission_id: submissionId });

  } catch (err) {
    console.error('[Webhook Fatal Error]', err, body ? JSON.stringify(body, null, 2) : '');
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
