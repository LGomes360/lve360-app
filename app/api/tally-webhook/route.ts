// app/api/tally-webhook/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { NormalizedSubmissionSchema } from '@/types/tally-normalized';
import { parseList, parseSupplements } from '@/lib/parseLists';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getAdmin() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

function cleanSingle(val: any): string | undefined {
  if (val == null) return undefined;
  if (Array.isArray(val)) return val.length ? cleanSingle(val[0]) : undefined;
  if (typeof val === 'object' && 'value' in val) return cleanSingle(val.value);
  if (typeof val === 'object' && 'id' in val) return cleanSingle(val.id);
  if (typeof val === 'object' && Object.keys(val).length === 1 && 'label' in val) return cleanSingle(val.label);
  if (typeof val === 'object') return undefined;
  if (typeof val === 'boolean') return val ? 'yes' : 'no';
  return String(val);
}

function cleanArray(val: any): string[] {
  if (val == null) return [];
  if (Array.isArray(val)) return val.map(cleanSingle).filter(Boolean) as string[];
  if (typeof val === 'string' && val.trim() !== '') return [val];
  return [];
}

// --- Simple key/value mapping helpers ---
function fieldsToMap(fields: any[]): Record<string, unknown> {
  const map: Record<string, unknown> = {};
  for (const f of fields ?? []) {
    if (!f) continue;
    const key = f.key ?? '';
    let val = f.value ?? f.text ?? f.answer ?? f;
    if (f.type === 'CHECKBOXES' && Array.isArray(f.value)) {
      val = f.value.map((v: any) => v?.label ?? v?.value ?? v);
    }
    map[key] = val;
    if (f.label) map[`label::${String(f.label).toLowerCase()}`] = val;
  }
  return map;
}

function answersToMap(answers: any[]): Record<string, unknown> {
  const map: Record<string, unknown> = {};
  for (const a of answers ?? []) {
    const label = a?.field?.label ? String(a.field.label).toLowerCase() : undefined;
    const key = a?.field?.id ?? a?.field?.key;
    let val = a?.text ?? a?.email ?? a?.choice?.label ?? a?.choices?.labels ?? a?.value ?? a;
    if (Array.isArray(val)) {
      val = val.map((v: any) => (typeof v === 'string' ? v : v?.label ?? v?.value ?? String(v))).filter(Boolean);
    }
    if (key) map[key] = val;
    if (label) map[`label::${label}`] = val;
  }
  return map;
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
    const fieldsMap = body?.data?.fields ? fieldsToMap(body.data.fields) : {};
    const answersMap = body?.form_response?.answers ? answersToMap(body.form_response.answers) : {};
    const src = { ...fieldsMap, ...answersMap };

    // --- Normalize fields
    const normalized = {
      user_email: cleanSingle(src['question_7K5g10'] ?? src['label::email address (your goes report here)']),
      name: cleanSingle(src['question_a4oPKX'] ?? src['label::name or nickname']),
      dob: cleanSingle(src['question_2KO5bg']),
      height: cleanSingle(src['question_Pzk8r1']),
      weight: cleanSingle(src['question_O7k8ka']),
      sex: cleanSingle(src['question_vDbvEl']),
      gender: cleanSingle(src['question_xJ9B0E']),
      pregnant: cleanSingle(src['question_RD8lZQ']),
      goals: cleanArray(src['question_o2lQ0N']),
      skip_meals: cleanSingle(src['question_ElYrZB']),
      energy_rating: cleanSingle(src['question_GpyjqL']),
      sleep_rating: cleanSingle(src['question_O78yjM']),
      allergies: cleanArray(src['question_o2l8rV']),
      conditions: cleanArray(src['question_7K5Yj6']),
      medications: cleanArray(src['question_Ex8YB2']),
      supplements: cleanArray(src['question_kNO8DM']),
      hormones: cleanArray(src['question_ro2Myv']),
      dosing_pref: cleanSingle(src['question_vDbapX']),
      brand_pref: cleanSingle(src['question_LKyjgz']),
      tier: cleanSingle(src['tier'] ?? 'free'),
    };

    console.log('[Webhook DEBUG] Normalized submission:', JSON.stringify(normalized, null, 2));

    // --- Validate using Zod ---
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
    const normalizedEmail = data.user_email;

    // --- Find or create canonical user ---
    let userId: string;
    const { data: existingUser } = await admin.from('users')
      .select('id, tier')
      .eq('email', normalizedEmail)
      .maybeSingle();

    if (existingUser) {
      userId = existingUser.id;
      // Upgrade tier if needed
      if (existingUser.tier !== 'premium' && data.tier === 'premium') {
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
