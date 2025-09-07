import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { TALLY_KEYS, NormalizedSubmissionSchema } from '@/types/tally-normalized';
import { parseList, parseSupplements } from '@/lib/parseLists';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getAdmin() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

// Utility: Accepts string, array, object — always returns string or undefined.
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

// Utility: Accepts array, string, object — always returns filtered array or [].
function cleanArray(val: any): string[] {
  if (val == null) return [];
  if (Array.isArray(val)) return val.map(cleanSingle).filter(Boolean) as string[];
  if (typeof val === 'object' && 'value' in val) return cleanArray(val.value);
  if (typeof val === 'object') return [];
  if (typeof val === 'string' && val.trim() !== '') return [val];
  return [];
}

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
      val = val
        .map((v: any) => (typeof v === 'string' ? v : v?.label ?? v?.value ?? String(v)))
        .filter(Boolean);
    }
    if (key) map[key] = val;
    if (label) map[`label::${label}`] = val;
  }
  return map;
}

function getByKeyOrLabel(src: Record<string, unknown>, key: string, labelCandidates: string[]): unknown {
  if (key && key in src) return src[key];
  for (const l of labelCandidates) {
    const v = src[`label::${l.toLowerCase()}`];
    if (v !== undefined) return v;
  }
  return undefined;
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
    // Unify both Tally shapes
    const fieldsMap = body?.data?.fields ? fieldsToMap(body.data.fields) : {};
    const answersMap = body?.form_response?.answers ? answersToMap(body.form_response.answers) : {};
    const src = { ...fieldsMap, ...answersMap };

    console.log('[Webhook DEBUG] Tally incoming fields map:', JSON.stringify(src, null, 2));

    // Normalization: always flatten and clean
    const normalized = {
      user_email: cleanSingle(getByKeyOrLabel(src, TALLY_KEYS.user_email, ['email', 'user email', 'your email'])),
      name: cleanSingle(getByKeyOrLabel(src, TALLY_KEYS.name, ['name', 'nickname'])),
      dob: cleanSingle(getByKeyOrLabel(src, TALLY_KEYS.dob, ['dob', 'date of birth'])),
      height: cleanSingle(getByKeyOrLabel(src, TALLY_KEYS.height, ['height'])),
      weight: (() => {
        const val = getByKeyOrLabel(src, TALLY_KEYS.weight, ['weight', 'weight (lb)', 'weight (lbs)']);
        if (typeof val === 'number') return val;
        if (typeof val === 'string') return val.replace(/[^0-9.]/g, '');
        return undefined;
      })(),
      sex: cleanSingle(getByKeyOrLabel(src, TALLY_KEYS.sex, ['sex at birth', 'sex'])),
      gender: cleanSingle(getByKeyOrLabel(src, TALLY_KEYS.gender, ['gender', 'gender identity'])),
      pregnant: cleanSingle(getByKeyOrLabel(src, TALLY_KEYS.pregnant, ['pregnant', 'pregnancy/breastfeeding', 'pregnancy'])),
      goals: cleanArray(parseList(getByKeyOrLabel(src, TALLY_KEYS.goals, ['goals', 'primary goals']))),
      skip_meals: cleanSingle(getByKeyOrLabel(src, TALLY_KEYS.skip_meals, ['skip meals'])),
      energy_rating: cleanSingle(getByKeyOrLabel(src, TALLY_KEYS.energy_rating, ['energy rating'])),
      sleep_rating: cleanSingle(getByKeyOrLabel(src, TALLY_KEYS.sleep_rating, ['sleep rating'])),
      allergies: (() => {
        const flag = String(cleanSingle(getByKeyOrLabel(src, TALLY_KEYS.allergies_flag, ['allergies', 'allergies or sensitivities'])) ?? '').toLowerCase();
        const details = getByKeyOrLabel(src, TALLY_KEYS.allergy_details, ['allergy details', 'what are you allergic to?']);
        return (flag === 'yes' || flag === 'true') && details ? cleanArray(parseList(details)) : [];
      })(),
      conditions: cleanArray(parseList(getByKeyOrLabel(src, TALLY_KEYS.conditions, ['conditions']))),
      medications: (() => {
        const flag = String(cleanSingle(getByKeyOrLabel(src, TALLY_KEYS.meds_flag, ['medications?'])) ?? '').toLowerCase();
        const list = getByKeyOrLabel(src, TALLY_KEYS.medications, ['medications', 'list medication']);
        return (flag === 'yes' || flag === 'true') && list ? cleanArray(parseList(list)) : cleanArray(parseList(list));
      })(),
      supplements: (() => {
        const flag = String(cleanSingle(getByKeyOrLabel(src, TALLY_KEYS.supplements_flag, ['supplements?'])) ?? '').toLowerCase();
        const list = getByKeyOrLabel(src, TALLY_KEYS.supplements, ['supplements', 'list supplements']);
        return (flag === 'yes' || flag === 'true') && list ? parseSupplements(list) : parseSupplements(list);
      })(),
      hormones: (() => {
        const flag = String(cleanSingle(getByKeyOrLabel(src, TALLY_KEYS.hormones_flag, ['hormones?'])) ?? '').toLowerCase();
        const list = getByKeyOrLabel(src, TALLY_KEYS.hormones, ['hormones', 'list hormones']);
        return (flag === 'yes' || flag === 'true') && list ? cleanArray(parseList(list)) : cleanArray(parseList(list));
      })(),
      dosing_pref: cleanSingle(getByKeyOrLabel(src, TALLY_KEYS.dosing_pref, ['dosing preference', 'what is realistic for your lifestyle?'])),
      brand_pref: cleanSingle(getByKeyOrLabel(src, TALLY_KEYS.brand_pref, ['brand preference', 'when it comes to supplements, do you prefer...'])),
      // Add answers key for future proofing
      answers: body?.data?.answers ?? body?.form_response?.answers ?? [],
    };

    console.log('[Webhook DEBUG] Normalized for Zod:', JSON.stringify(normalized, null, 2));

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

    console.log('[Webhook DEBUG] Final DB insert payload:', JSON.stringify(data, null, 2));

    const { data: subRow, error: subErr } = await admin
      .from('submissions')
      .insert({
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
        answers: data.answers ?? [], // <- Always insert a value for NOT NULL columns!
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
    // (child-table inserts go here, unchanged...)

    return NextResponse.json({ ok: true, submission_id: submissionId });
  } catch (err) {
    console.error('[Webhook Fatal Error]', err, body ? JSON.stringify(body, null, 2) : '');
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
