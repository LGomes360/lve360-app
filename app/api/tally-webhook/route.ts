import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { TALLY_KEYS, NormalizedSubmissionSchema } from '@/types/tally-normalized';
import { parseList, parseSupplements } from '@/lib/parseLists';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getAdmin() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

function buildFieldLookups(fields: any[]) {
  const keyMap: Record<string, any> = {};
  const optionMaps: Record<string, Record<string, string>> = {};
  for (const f of fields ?? []) {
    if (!f || !f.key) continue;
    keyMap[f.key] = f;
    if (Array.isArray(f.options)) {
      optionMaps[f.key] = {};
      for (const opt of f.options) {
        optionMaps[f.key][opt.id] = opt.text ?? opt.label ?? String(opt.id);
      }
    }
  }
  return { keyMap, optionMaps };
}

function idToLabel(val: any, fieldKey: string, optionMaps: Record<string, Record<string, string>>) {
  if (!optionMaps[fieldKey]) return val;
  if (Array.isArray(val)) return val.map((id) => optionMaps[fieldKey][id] || id);
  if (typeof val === 'string') return optionMaps[fieldKey][val] || val;
  return val;
}

function fieldsToMap(fields: any[], optionMaps: Record<string, Record<string, string>>): Record<string, unknown> {
  const map: Record<string, unknown> = {};
  for (const f of fields ?? []) {
    if (!f) continue;
    const key = f.key ?? '';
    let val = f.value ?? f.text ?? f.answer ?? f;
    if (optionMaps[key]) val = idToLabel(val, key, optionMaps);
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

// --- UNIVERSAL UNWRAP FUNCTION ---
function unwrap(val: unknown): unknown {
  if (Array.isArray(val)) return val[0];
  return val;
}

export async function POST(req: NextRequest) {
  const admin = getAdmin();
  let body: any;
  try {
    body = await req.json();
  } catch (err) {
    console.error('[Webhook] Invalid JSON:', err);
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  try {
    const rawFields = body?.data?.fields ?? [];
    const { keyMap, optionMaps } = buildFieldLookups(rawFields);
    const fieldsMap = rawFields.length ? fieldsToMap(rawFields, optionMaps) : {};
    const answersMap = body?.form_response?.answers ? answersToMap(body.form_response.answers) : {};
    const src = { ...fieldsMap, ...answersMap };

    // ---- Normalize + Unwrap array fields where Zod expects string ----
    const normalized = {
      user_email: String(unwrap(getByKeyOrLabel(src, TALLY_KEYS.user_email, ['email', 'user email', 'your email'])) ?? ''),
      name: unwrap(getByKeyOrLabel(src, TALLY_KEYS.name, ['name', 'nickname'])) as string | undefined,
      dob: unwrap(getByKeyOrLabel(src, TALLY_KEYS.dob, ['dob', 'date of birth'])) as string | undefined,
      height: unwrap(getByKeyOrLabel(src, TALLY_KEYS.height, ['height'])) as string | undefined,
      weight: unwrap(getByKeyOrLabel(src, TALLY_KEYS.weight, ['weight', 'weight (lb)', 'weight (lbs)'])) as string | number | undefined,
      sex: unwrap(getByKeyOrLabel(src, TALLY_KEYS.sex, ['sex at birth', 'sex'])) as string | undefined,
      gender: unwrap(getByKeyOrLabel(src, TALLY_KEYS.gender, ['gender'])) as string | undefined,
      pregnant: unwrap(getByKeyOrLabel(src, TALLY_KEYS.pregnant, ['pregnant'])) as string | boolean | undefined,
      goals: parseList(unwrap(getByKeyOrLabel(src, TALLY_KEYS.goals, ['goals', 'primary goals']))),
      skip_meals: unwrap(getByKeyOrLabel(src, TALLY_KEYS.skip_meals, ['skip meals'])) as string | boolean | undefined,
      energy_rating: unwrap(getByKeyOrLabel(src, TALLY_KEYS.energy_rating, ['energy rating'])) as string | number | undefined,
      sleep_rating: unwrap(getByKeyOrLabel(src, TALLY_KEYS.sleep_rating, ['sleep rating'])) as string | number | undefined,
      allergies: (() => {
        const flag = String(unwrap(getByKeyOrLabel(src, TALLY_KEYS.allergies_flag, ['allergies'])) ?? '').toLowerCase();
        const details = unwrap(getByKeyOrLabel(src, TALLY_KEYS.allergy_details, ['allergy details']));
        return flag === 'yes' || flag === 'true' ? parseList(details) : [];
      })(),
      conditions: parseList(unwrap(getByKeyOrLabel(src, TALLY_KEYS.conditions, ['conditions']))),
      medications: (() => {
        const flag = String(unwrap(getByKeyOrLabel(src, TALLY_KEYS.meds_flag, ['medications?'])) ?? '').toLowerCase();
        const list = unwrap(getByKeyOrLabel(src, TALLY_KEYS.medications, ['medications']));
        return flag === 'yes' || flag === 'true' ? parseList(list) : parseList(list);
      })(),
      supplements: (() => {
        const flag = String(unwrap(getByKeyOrLabel(src, TALLY_KEYS.supplements_flag, ['supplements?'])) ?? '').toLowerCase();
        const list = unwrap(getByKeyOrLabel(src, TALLY_KEYS.supplements, ['supplements']));
        return flag === 'yes' || flag === 'true' ? parseSupplements(list) : parseSupplements(list);
      })(),
      hormones: (() => {
        const flag = String(unwrap(getByKeyOrLabel(src, TALLY_KEYS.hormones_flag, ['hormones?'])) ?? '').toLowerCase();
        const list = unwrap(getByKeyOrLabel(src, TALLY_KEYS.hormones, ['hormones']));
        return flag === 'yes' || flag === 'true' ? parseList(list) : parseList(list);
      })(),
      dosing_pref: unwrap(getByKeyOrLabel(src, TALLY_KEYS.dosing_pref, ['dosing preference'])) as string | undefined,
      brand_pref: unwrap(getByKeyOrLabel(src, TALLY_KEYS.brand_pref, ['brand preference'])) as string | undefined,
    };

    // DEBUG: Normalized shape
    console.log('[Webhook] Normalized for Zod:', JSON.stringify(normalized, null, 2));

    // Validate
    const parsed = NormalizedSubmissionSchema.safeParse(normalized);
    if (!parsed.success) {
      console.error('[Validation Error] Normalized submission failed Zod check:', {
        error: parsed.error.flatten(),
        tried: normalized,
      });
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
      console.error('[Validation Error] Missing user_email after normalization.');
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
        medications: data.medications,
        supplements: data.supplements,
        hormones: data.hormones,
        dosing_pref: data.dosing_pref,
        brand_pref: data.brand_pref,
        payload_json: body,
      })
      .select('id')
      .single();

    if (subErr || !subRow) {
      console.error('[DB Insert Error] submissions:', subErr);
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

    // ===== Fan-out child rows (with logging) =====
    if (data.medications?.length) {
      console.log('[Webhook] Medications child insert:', JSON.stringify(data.medications, null, 2));
      const medsRows = data.medications.map((name: string) => ({
        submission_id: submissionId,
        name,
      }));
      const { error: medsErr } = await admin.from('submission_medications').insert(medsRows);
      if (medsErr) {
        console.error('[DB Insert Error] submission_medications:', medsErr);
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

    if (data.hormones?.length) {
      console.log('[Webhook] Hormones child insert:', JSON.stringify(data.hormones, null, 2));
      const hormoneRows = data.hormones.map((name: string) => ({
        submission_id: submissionId,
        name,
      }));
      const { error: hormonesErr } = await admin.from('submission_hormones').insert(hormoneRows);
      if (hormonesErr) {
        console.error('[DB Insert Error] submission_hormones:', hormonesErr);
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

    if (data.supplements?.length) {
      console.log('[Webhook] Supplements child insert:', JSON.stringify(data.supplements, null, 2));
      const suppRows = data.supplements.map((s: any) => ({
        submission_id: submissionId,
        name: s.name,
        brand: s.brand ?? null,
        dose: s.dose ?? null,
        timing: s.timing ?? null,
        source: 'intake',
      }));
      const { error: suppErr } = await admin.from('submission_supplements').insert(suppRows);
      if (suppErr) {
        console.error('[DB Insert Error] submission_supplements:', suppErr);
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
  } catch (err) {
    console.error('[Webhook Fatal Error]', err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
