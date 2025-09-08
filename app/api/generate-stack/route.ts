// lve360-app/app/api/generate-stack/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateStack } from '@/lib/generateStack';

function assertEnv() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing Supabase env variables');
  }
}

function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

export const dynamic = 'force-dynamic';

/**
 * GET returns route info only.
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: '/api/generate-stack',
    method: 'POST',
    body: '{ "email"?: string, "user_id"?: string }',
    note: 'Generates a stack from the latest submission and upserts into `stacks`.',
  });
}

/**
 * POST: Generate and save a personalized supplement stack
 */
export async function POST(request: NextRequest) {
  try {
    assertEnv();
    const supabase = supabaseAdmin();

    // --- Parse body ---
    const { email, user_id } = await safeJson<{ email?: string; user_id?: string }>(request);

    // --- Authenticate & validate paid user ---
    const resolvedUserId = user_id ?? email;
    const { data: user, error: userErr } = await supabase
      .from('users')
      .select('id, paid')
      .eq('id', resolvedUserId)
      .single();

    if (userErr || !user) {
      return NextResponse.json({ ok: false, error: 'User not found or unauthorized' }, { status: 401 });
    }
    if (!user.paid) {
      return NextResponse.json({ ok: false, error: 'User has not paid' }, { status: 403 });
    }

    // --- Fetch latest submission ---
    const submission = await getLatestSubmission(supabase, resolvedUserId, email);
    if (!submission) {
      return NextResponse.json({ ok: false, error: 'No submission found' }, { status: 404 });
    }

    // --- Ensure email ---
    const resolvedEmail = submission.email ?? email;
    if (!resolvedEmail) {
      return NextResponse.json({ ok: false, error: 'Submission missing user email' }, { status: 400 });
    }

    // --- Generate stack ---
    const items = await generateStack(submission) ?? [];

    const generated = {
      items,
      summary: null,
      version: 'v1',              // make sure DB column is TEXT
      totalMonthlyCost: null,
      notes: null,
    };

    // --- Upsert stack ---
    const stackRow = {
      submission_id: submission.id,
      user_id: user.id,
      user_email: resolvedEmail,   // satisfies NOT NULL
      items: generated.items,      // default empty array if null
      summary: generated.summary,
      version: generated.version,
      total_monthly_cost: generated.totalMonthlyCost,
      notes: generated.notes,
    };

    const { data: upserted, error: upsertErr } = await supabase
      .from('stacks')
      .upsert(stackRow, { onConflict: 'submission_id' })
      .select()
      .single();

    if (upsertErr) {
      return NextResponse.json({ ok: false, error: upsertErr.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      submission_id: submission.id,
      stack_id: upserted?.id ?? null,
      items_preview: generated.items.slice(0, 5),
      meta: {
        email: resolvedEmail,
        version: generated.version,
        user_id: user.id,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message ?? 'Unknown server error' }, { status: 500 });
  }
}

// ---------------- Helper Functions ----------------

async function safeJson<T = unknown>(req: NextRequest): Promise<T | Record<string, never>> {
  try {
    const len = req.headers.get('content-length');
    if (!len || len === '0') return {};
    return (await req.json()) as T;
  } catch {
    return {};
  }
}

async function getLatestSubmission(
  supabase: ReturnType<typeof supabaseAdmin>,
  user_id?: string,
  email?: string
): Promise<any | null> {
  let query = supabase.from('submissions').select('*').order('created_at', { ascending: false }).limit(1);
  if (user_id) query = query.eq('user_id', user_id);
  if (email) query = query.eq('email', email);
  const { data, error } = await query;
  if (error) throw new Error(`Failed to fetch latest submission: ${error.message}`);
  return data?.[0] ?? null;
}