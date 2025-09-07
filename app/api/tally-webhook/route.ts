import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { TALLY_KEYS, NormalizedSubmissionSchema } from '@/types/tally-normalized';
import { parseList, parseSupplements } from '@/lib/parseLists';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getAdmin() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

// Normalize Tally field arrays into a simple { key -> value } map
function fieldsToMap(fields: any[]): Record<string, unknown> {
  const map: Record<string, unknown> = {};
  for (const f of fields ?? []) {
    if (!f) continue;
    const key = f.key ?? '';
    // Tally values are usually under .value; fall back to common shapes
    let val = f.value ?? f.text ?? f.answer ?? f;
    if (f.type === 'CHECKBOXES' && Array.isArray(f.value)) {
      val = f.value.map((v: any) => v?.label ?? v?.value ?? v);
    }
    map[key] = val;
    // label fallback (lowercased)
    if (f.label) map[`label::${String(f.label).toLowerCase()}`] = val;
  }
  return map;
}

// Legacy answers to map
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
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  // Unify both Tally shapes
  const fieldsMap = body?.data?.fields ? fieldsToMap(body.data.fields) : {};
  const answersMap = body?.form_response?.answers ? answersToMap(body.form_response.answers) : {};
  const src = { ...fieldsMap, ...answersMap };

  // Build normalized record using keys, then labels as fallback
  const normalized = {
    user_email: String(getByKeyOrLabel(src, TALLY_KEYS.user_email, ['email', 'user email', 'your email']) ?? ''),
    name: getByKeyOrLabel(src, TALLY_KEYS.name, ['name', 'nickname']) as string | undefined,
    dob: getByKeyOrLabel(src, TALLY_KEYS.dob, ['dob', 'date of birth']) as string | undefined,
    height: getByKeyOrLabel(src, TALLY_KEYS.height, ['height']) as string | undefined,
    weight: getByKeyOrLabel(src, TALLY_KEYS.weight, ['weight', 'weight (lb)', 'weight (lbs)']) as string | number | undefined,
    sex: getByKeyOrLabel(src, TALLY_KEYS.sex, ['sex at birth', 'sex']) as string | undefined,
    gender: getByKeyOrLabel(src, TALLY_KEYS.gender, ['gender']) as string | undefined,
    pregnant: getByKeyOrLabel(src, TALLY_KEYS.pregnant, ['pregnant']) as string | boolean | undefined,
    goals: parseList(getByKeyOrLabel(src, TALLY_KEYS.goals, ['goals', 'primary goals'])),
    skip_meals: getByKeyOrLabel(src, TALLY_KEYS.skip_meals, ['skip meals']) as string | boolean | undefined,
    energy_rating: getByKeyOrLabel(src, TALLY_KEYS.energy_rating, ['energy rating']) as string | number | undefined,
    sleep_rating: getByKeyOrLabel(src, TALLY_KEYS.sleep_rating, ['sleep rating']) as string | number | undefined,
    allergies: (() => {
      const flag = String(getByKeyOrLabel(src, TALLY_KEYS.allergies_flag, ['allergies']) ?? '').toLowerCase();
      const details = getByKeyOrLabel(src, TALLY_KEYS.allergy_details, ['allergy details']);
      return flag === 'yes' || flag === 'true' ? parseList(details) : [];
    })(),
    conditions: parseList(getByKeyOrLabel(src, TALLY_KEYS.conditions, ['conditions'])),
    medications: (() => {
      const flag = String(getByKeyOrLabel(src, TALLY_KEYS.meds_flag, ['medications?']) ?? '').toLowerCase();
      const list = getByKeyOrLabel(src, TALLY_KEYS.medications, ['medications']);
      return flag === 'yes' || flag === 'true' ? parseList(list) : parseList(list);
    })(),
    supplements: (() => {
      const flag = String(getByKeyOrLabel(src, TALLY_KEYS.supplements_flag, ['supplements?']) ?? '').toLowerCase();
      const list = getByKeyOrLabel(src, TALLY_KEYS.supplements, ['supplements']);
      return flag === 'yes' || flag === 'true' ? parseSupplements(list) : parseSupplements(list);
    })(),
    hormones: (() => {
      const flag = String(getByKeyOrLabel(src, TALLY_KEYS.hormones_flag, ['hormones?']) ?? '').toLowerCase();
      const list = getByKeyOrLabel(src, TALLY_KEYS.hormones, ['hormones']);
      return flag === 'yes' || flag === 'true' ? parseList(list) : parseList(list);
    })(),
    dosing_pref: getByKeyOrLabel(src, TALLY_KEYS.dosing_pref, ['dosing preference']) as string | undefined,
    brand_pref: getByKeyOrLabel(src, TALLY_KEYS.brand_pref, ['brand preference']) as string | undefined,
  };

  // Validate
  const parsed = NormalizedSubmissionSchema.safeParse(normalized);
  if (!parsed.success) {
    await admin.from('webhook_failures').insert({
      source: 'tally',
      event_type: body?.eventType ?? body?.event_type ?? null,
      event_id: body?.eventId ?? body?.event_id ?? null,
      error_message: `validation_error: ${parsed.error.flatten().formErrors.join('; ')}`,
      severity: 'error',
      payload_json: body,
    });
    return NextResponse.json({ ok: false, error: 'Validation failed' }, { status: 422 });
  }

  const data = parsed.data;
  if (!data.user_email) {
    await admin.from('webhook_failures').insert({
      source: 'tally',
      event_type: body?.eventType ?? body?.event_type ?? null,
      event_id: body?.eventId ?? body?.event_id ?? null,
      error_message: 'missing_user_email',
      severity: 'warn',
      payload_json: body,
    });
    return NextResponse.json({ ok: false, error: 'Missing user_email' }, { status: 400 });
  }

  // Insert into submissions first
  const { data: subRow, error: subErr } = await admin
    .from('submissions')
    .insert({
      user_email: data.user_email,
      name: data.name,
      dob: data.dob,
      height: data.height,
      weight:
        typeof data.weight === 'number'
          ? data.weight
          : data.weight
          ? Number(String(data.weight).replace(/[^0-9.]/g, ''))
          : null,
      sex: data.sex,
      gender: data.gender,
      pregnant: typeof data.pregnant === 'boolean' ? data.pregnant : String(data.pregnant ?? '').toLowerCase() === 'yes',
      goals: data.goals,
      skip_meals:
        typeof data.skip_meals === 'boolean' ? data.skip_meals : String(data.skip_meals ?? '').toLowerCase() === 'yes',
      energy_rating: data.energy_rating,
      sleep_rating: data.sleep_rating,
      allergies: data.allergies,
      conditions: data.conditions,
      // keep original list for audit
      medications: data.medications,
      // keep original list for audit
      supplements: data.supplements,
      // keep original list for audit
      hormones: data.hormones,
      dosing_pref: data.dosing_pref,
      brand_pref: data.brand_pref,
      payload_json: body,
    })
    .select('id')
    .single();

  if (subErr || !subRow) {
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

  // ===== Fan-out child rows (sequential, with individual error logging) =====

  // 1) Medications
  if (data.medications?.length) {
    const medsRows = data.medications.map((name) => ({
      submission_id: submissionId,
      name,
    }));
    const { error: medsErr } = await admin.from('submission_medications').insert(medsRows);
    if (medsErr) {
      await admin.from('webhook_failures').insert({
        source: 'tally',
        event_type: body?.eventType ?? body?.event_type ?? null,
        event_id: body?.eventId ?? body?.event_id ?? null,
        error_message: `child_insert_error: ${medsErr.message}`,
        severity: 'error',
        payload_json: body,
      });
    }
  }

  // 2) Hormones
  if (data.hormones?.length) {
    const hormoneRows = data.hormones.map((name) => ({
      submission_id: submissionId,
      name,
    }));
    const { error: hormonesErr } = await admin.from('submission_hormones').insert(hormoneRows);
    if (hormonesErr) {
      await admin.from('webhook_failures').insert({
        source: 'tally',
        event_type: body?.eventType ?? body?.event_type ?? null,
        event_id: body?.eventId ?? body?.event_id ?? null,
        error_message: `child_insert_error: ${hormonesErr.message}`,
        severity: 'error',
        payload_json: body,
      });
    }
  }

  // 3) Supplements
  if (data.supplements?.length) {
    const suppRows = data.supplements.map((s) => ({
      submission_id: submissionId,
      name: s.name,
      brand: s.brand ?? null,
      dose: s.dose ?? null,
      timing: s.timing ?? null,
      source: 'intake',
    }));
    const { error: suppErr } = await admin.from('submission_supplements').insert(suppRows);
    if (suppErr) {
      await admin.from('webhook_failures').insert({
        source: 'tally',
        event_type: body?.eventType ?? body?.event_type ?? null,
        event_id: body?.eventId ?? body?.event_id ?? null,
        error_message: `child_insert_error: ${suppErr.message}`,
        severity: 'error',
        payload_json: body,
      });
    }
  }

  return NextResponse.json({ ok: true, submission_id: submissionId });
}
