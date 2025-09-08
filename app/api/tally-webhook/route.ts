import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { NormalizedSubmissionSchema } from '@/types/tally-normalized';
import { parseList, parseSupplements } from '@/lib/parseLists';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getAdmin() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

function normalizeEmail(email?: string): string | undefined {
  return email ? email.trim().toLowerCase() : undefined;
}

// --- Updated TALLY_KEYS to include all relevant fields ---
export const TALLY_KEYS = {
  user_email: "question_7K5g10",
  name: "question_a4oPKX",
  dob: "question_2KO5bg",
  height: "question_Pzk8r1",
  weight: "question_O7k8ka",
  sex: "question_vDbvEl",
  gender: "question_xJ9B0E",
  pregnant: "question_RD8lZQ",
  goals: "question_o2lQ0N",
  skip_meals: "question_ElYrZB",
  energy_rating: "question_GpyjqL",
  sleep_rating: "question_O78yjM",
  allergies: "question_KxyNWX",
  conditions: "question_7K5Yj6",
  medications: "question_Vzoy96",
  supplements: "question_Bx8JON",
  hormones: "question_Ex87zN",
  dosing_pref: "question_vDbapX",
  brand_pref: "question_LKyjgz",
  tier: "tier", // optional if you track membership tier in Tally
} as const;

interface TallyField {
  key: string;
  value: any;
  label?: string;
  type?: string;
  [prop: string]: any;
}

interface TallyAnswer {
  field?: { id?: string; key?: string; label?: string };
  value?: any;
  [prop: string]: any;
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
    const fieldsMap: Record<string, unknown> = body?.data?.fields
      ? Object.fromEntries(
          (body.data.fields as TallyField[]).map((f: TallyField) => [f.key, f.value])
        )
      : {};

    const answersMap: Record<string, unknown> = body?.form_response?.answers
      ? Object.fromEntries(
          (body.form_response.answers as TallyAnswer[]).map((a: TallyAnswer) => [
            a.field?.id ?? a.field?.key ?? '',
            a.value ?? null,
          ])
        )
      : {};

    const src = { ...fieldsMap, ...answersMap };

    // --- Type-safe helper to index TALLY_KEYS ---
    function getValue<K extends keyof typeof TALLY_KEYS>(key: K) {
      return src[TALLY_KEYS[key] as keyof typeof src];
    }

    // --- Normalize for Zod ---
    const normalized = {
      user_email: normalizeEmail(getValue('user_email') as string),
      name: getValue('name') ?? null,
      dob: getValue('dob') ?? null,
      height: getValue('height') ?? null,
      weight: getValue('weight') ?? null,
      sex: getValue('sex') ?? null,
      gender: getValue('gender') ?? null,
      pregnant: getValue('pregnant') ?? null,
      goals: parseList(getValue('goals') ?? []),
      skip_meals: getValue('skip_meals') ?? null,
      energy_rating: getValue('energy_rating') ?? null,
      sleep_rating: getValue('sleep_rating') ?? null,
      allergies: parseList(getValue('allergies') ?? []),
      conditions: parseList(getValue('conditions') ?? []),
      medications: parseList(getValue('medications') ?? []),
      supplements: parseSupplements(getValue('supplements') ?? []),
      hormones: parseList(getValue('hormones') ?? []),
      dosing_pref: getValue('dosing_pref') ?? null,
      brand_pref: getValue('brand_pref') ?? null,
      tier: getValue('tier') ?? 'free',
    };

    console.log('[Webhook DEBUG] Normalized submission:', JSON.stringify(normalized, null, 2));

    // --- Validate ---
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

    return NextResponse.json({ ok: true, submission_id: subRow.id });

  } catch (err) {
    console.error('[Webhook Fatal Error]', err, body ? JSON.stringify(body, null, 2) : '');
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
