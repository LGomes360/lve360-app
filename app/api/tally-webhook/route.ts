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
    const fields = body?.data?.fields ?? body?.form_response?.answers?.fields ?? [];

    // --- Normalize for Zod ---
    const normalized = {
      user_email: cleanSingle(fields.find(f => f.key === 'question_7K5g10')?.value),
      name: cleanSingle(fields.find(f => f.key === 'question_a4oPKX')?.value),
      dob: cleanSingle(fields.find(f => f.key === 'question_2KO5bg')?.value),
      height: cleanSingle(fields.find(f => f.key === 'question_Pzk8r1')?.value),
      weight: cleanSingle(fields.find(f => f.key === 'question_O7k8ka')?.value),
      sex: cleanSingle(fields.find(f => f.key === 'question_vDbvEl')?.value),
      gender: cleanSingle(fields.find(f => f.key === 'question_xJ9B0E')?.value),
      pregnant: cleanSingle(fields.find(f => f.key === 'question_RD8lZQ')?.value),
      goals: cleanArray(fields.find(f => f.key === 'question_o2lQ0N')?.value),
      skip_meals: cleanSingle(fields.find(f => f.key === 'question_ElYrZB')?.value),
      energy_rating: cleanSingle(fields.find(f => f.key === 'question_GpyjqL')?.value),
      sleep_rating: cleanSingle(fields.find(f => f.key === 'question_O78yjM')?.value),
      allergies: cleanArray(fields.find(f => f.key === 'question_o2l8rV')?.value),
      conditions: cleanArray(fields.find(f => f.key === 'question_7K5Yj6')?.value),
      medications: cleanArray(fields.find(f => f.key === 'question_Ex8YB2')?.value),
      supplements: cleanArray(fields.find(f => f.key === 'question_kNO8DM')?.value),
      hormones: cleanArray(fields.find(f => f.key === 'question_ro2Myv')?.value),
      dosing_pref: cleanSingle(fields.find(f => f.key === 'question_vDbapX')?.value),
      brand_pref: cleanSingle(fields.find(f => f.key === 'question_LKyjgz')?.value),
    };

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
    const normalizedEmail = data.user_email!;
    let userId: string;

    // --- Find or create canonical user row ---
    const { data: existingUser } = await admin.from('users')
      .select('id, tier')
      .eq('email', normalizedEmail)
      .maybeSingle();

    if (existingUser) {
      userId = existingUser.id;
    } else {
      const { data: newUser } = await admin.from('users')
        .insert({ email: normalizedEmail, tier: 'free' })
        .select('id')
        .single();
      userId = newUser.id;
    }

    // --- Insert submission linked to canonical user_id ---
    const answersPayload = body?.data?.fields ?? body?.form_response?.answers?.fields ?? [];
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
