import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { TALLY_KEYS, NormalizedSubmissionSchema } from '@/types/tally-normalized';
import { parseList, parseSupplements } from '@/lib/parseLists';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getAdmin() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

// Utility: Safely extract dropdown values (handles array, object, or primitive)
function normalizeDropdown(val: any) {
  if (val == null) return undefined;
  if (Array.isArray(val)) return val.length === 1 ? val[0] : val;
  if (typeof val === 'object' && val !== null && 'value' in val) return val.value;
  return val;
}

// Utility: Strip out empty/nullish from array
function filterNullish(arr: any) {
  return Array.isArray(arr) ? arr.filter((v) => v != null && v !== '') : arr;
}

// Convert Tally's incoming fields/answers into a key-value map
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
    // Lowercased label as alternate key
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
  } catch (err) {
    console.error('[Webhook] Invalid JSON:', err);
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  try {
    // Step 1: Unify both Tally field shapes
    const fieldsMap = body?.data?.fields ? fieldsToMap(body.data.fields) : {};
    const answersMap = body?.form_response?.answers ? answersToMap(body.form_response.answers) : {};
    const src = { ...fieldsMap, ...answersMap };

    // DEBUG: log incoming for troubleshooting
    console.log('[Webhook] Tally incoming fields map:', JSON.stringify(src, null, 2));

    // Step 2: Normalize to flat object for Zod
    const normalized = {
      user_email: String(getByKeyOrLabel(src, TALLY_KEYS.user_email, ['email', 'user email', 'your email']) ?? ''),
      name: getByKeyOrLabel(src, TALLY_KEYS.name, ['name', 'nickname']) as string | undefined,
      dob: getByKeyOrLabel(src, TALLY_KEYS.dob, ['dob', 'date of birth']) as string | undefined,
      height: getByKeyOrLabel(src, TALLY_KEYS.height, ['height']) as string | undefined,
      weight: getByKeyOrLabel(src, TALLY_KEYS.weight, ['weight', 'weight (lb)', 'weight (lbs)']) as string | number | undefined,

      // Use normalizeDropdown to always flatten dropdowns to single value if possible
      sex: normalizeDropdown(getByKeyOrLabel(src, TALLY_KEYS.sex, ['sex at birth', 'sex'])),
      gender: normalizeDropdown(getByKeyOrLabel(src, TALLY_KEYS.gender, ['gender'])),
      pregnant: normalizeDropdown(getByKeyOrLabel(src, TALLY_KEYS.pregnant, ['pregnant', 'pregnancy', 'pregnancy/breastfeeding'])),

      goals: filterNullish(parseList(getByKeyOrLabel(src, TALLY_KEYS.goals, ['goals', 'primary goals']))),
      skip_meals: normalizeDropdown(getByKeyOrLabel(src, TALLY_KEYS.skip_meals, ['skip meals'])),
      energy_rating: getByKeyOrLabel(src, TALLY_KEYS.energy_rating, ['energy rating']),
      sleep_rating: getByKeyOrLabel(src, TALLY_KEYS.sleep_rating, ['sleep rating']),
      allergies: (() => {
        const flag = String(normalizeDropdown(getByKeyOrLabel(src, TALLY_KEYS.allergies_flag, ['allergies', 'allergies or sensitivities'])) ?? '').toLowerCase();
        const details = getByKeyOrLabel(src, TALLY_KEYS.allergy_details, ['allergy details', 'what are you allergic to?']);
        return (flag === 'yes' || flag === 'true') && details ? parseList(details) : [];
      })(),
      conditions: filterNullish(parseList(getByKeyOrLabel(src, TALLY_KEYS.conditions, ['conditions']))),
      medications: (() => {
        const flag = String(normalizeDropdown(getByKeyOrLabel(src, TALLY_KEYS.meds_flag, ['medications?'])) ?? '').toLowerCase();
        const list = getByKeyOrLabel(src, TALLY_KEYS.medications, ['medications', 'list medication']);
        return (flag === 'yes' || flag === 'true') && list ? parseList(list) : parseList(list);
      })(),
      supplements: (() => {
        const flag = String(normalizeDropdown(getByKeyOrLabel(src, TALLY_KEYS.supplements_flag, ['supplements?'])) ?? '').toLowerCase();
        const list = getByKeyOrLabel(src, TALLY_KEYS.supplements, ['supplements', 'list supplements']);
        return (flag === 'yes' || flag === 'true') && list ? parseSupplements(list) : parseSupplements(list);
      })(),
      hormones: (() => {
        const flag = String(normalizeDropdown(getByKeyOrLabel(src, TALLY_KEYS.hormones_flag, ['hormones?'])) ?? '').toLowerCase();
        const list = getByKeyOrLabel(src, TALLY_KEYS.hormones, ['hormones', 'list hormones']);
        return (flag === 'yes' || flag === 'true') && list ? parseList(list) : parseList(list);
      })(),
      dosing_pref: normalizeDropdown(getByKeyOrLabel(src, TALLY_KEYS.dosing_pref, ['dosing preference', 'what is realistic for your lifestyle?'])),
      brand_pref: normalizeDropdown(getByKeyOrLabel(src, TALLY_KEYS.brand_pref, ['brand preference', 'when it comes to supplements, do you prefer...'])),
    };

    console.log('[Webhook] Normalized for Zod:', JSON.stringify(normalized, null, 2));

    // Step 3: Validate for Supabase using Zod schema
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
        error_message: `validation_error: ${JSON.stringify(parsed.error.flatten())}`,
        severity: 'error',
        payload_json: body,
      });
      return NextResponse.json({ ok: false, error: 'Validation failed' }, { status: 422 });
    }
    const data = parsed.data;

    // Step 4: Insert into submissions
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

    // Step 5: Insert child rows (meds, hormones, supplements)
    if (Array.isArray(data.medications) && data.medications.length) {
      const medsRows = data.medications.map((name) => ({ submission_id: submissionId, name }));
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
    if (Array.isArray(data.hormones) && data.hormones.length) {
      const hormoneRows = data.hormones.map((name) => ({ submission_id: submissionId, name }));
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
    if (Array.isArray(data.supplements) && data.supplements.length) {
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
  } catch (err) {
    // Top-level catch
    console.error('[Webhook Fatal Error]', err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
