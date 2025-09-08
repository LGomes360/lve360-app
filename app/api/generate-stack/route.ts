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
 * GET returns route info only (docs/test, no data).
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: '/api/generate-stack',
    method: 'POST',
    body: '{ "email"?: string, "user_id"?: string }',
    note: 'Generates a stack from the latest submission (filtered by user_id or email) and upserts into `stacks`.',
  });
}

/**
 * POST: Generate and save a supplement stack for the given user/email.
 */
export async function POST(request: Request) {
  try {
    assertEnv();
    const { email, user_id } = await safeJson<{ email?: string; user_id?: string }>(request);
    const supabase = supabaseAdmin();

    let submission;

    if (user_id) {
      // Find latest submission for this user_id
      const { data, error } = await supabase
        .from('submissions')
        .select('*')
        .eq('user_id', user_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw new Error(`Failed to fetch submission for user_id ${user_id}: ${error.message}`);
      if (!data) {
        return NextResponse.json({ ok: false, error: `No submissions found for user_id ${user_id}` }, { status: 404 });
      }
      submission = data;
    } else if (email) {
      submission = await getLatestSubmission(supabase, email);
      if (!submission) {
        return NextResponse.json({ ok: false, error: `No submissions found for ${email}` }, { status: 404 });
      }
    } else {
      return NextResponse.json({ ok: false, error: 'Must provide user_id or email' }, { status: 400 });
    }

    // 2. Generate the stack (calls your business logic)
    const items = await generateStack(submission);

    const generated = {
      items: items ?? [],
      summary: null,
      version: 'v1',
      totalMonthlyCost: null,
      notes: null,
    };

    // Always resolve user_id from email if not passed
    const resolvedUserId = user_id ?? (await findOrCreateUserIdForEmail(supabase, submission.email ?? email));

    // 3. Upsert stack with user_id
    const stackRow = {
      submission_id: submission.id,
      user_id: resolvedUserId ?? null,
      email: submission.email ?? email ?? null,
      items: generated.items,
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
        email: submission.email ?? email ?? null,
        version: generated.version ?? 'v1',
        user_id: resolvedUserId ?? null,
      },
    });
  } catch (err: any) {
    // Optionally: log the full error to a server log here
    return NextResponse.json({ ok: false, error: err?.message ?? 'Unknown server error' }, { status: 500 });
  }
}

// ---------- Helper Functions ----------

/** Robust JSON body parser for Next.js Route Handlers */
async function safeJson<T = unknown>(req: Request): Promise<T | Record<string, never>> {
  try {
    const len = req.headers.get('content-length');
    if (!len || len === '0') return {};
    return (await req.json()) as T;
  } catch {
    return {};
  }
}

/** Gets latest submission for a user/email (most recent first) */
async function getLatestSubmission(
  supabase: ReturnType<typeof supabaseAdmin>,
  email?: string
): Promise<any | null> {
  let query = supabase.from('submissions').select('*').order('created_at', { ascending: false }).limit(1);
  if (email) query = query.eq('email', email);
  const { data, error } = await query;
  if (error) throw new Error(`Failed to fetch latest submission: ${error.message}`);
  return (data?.[0] ?? null);
}

/** Finds user_id for email, or creates new user row if needed */
async function findOrCreateUserIdForEmail(
  supabase: ReturnType<typeof supabaseAdmin>,
  email?: string | null
): Promise<string | null> {
  if (!email) return null;
  const { data: user, error } = await supabase
    .from('users')
    .select('id')
    .eq('email', email)
    .single();

  // PGRST116 = no rows found
  if (error && error.code !== 'PGRST116') throw new Error(`Failed to lookup user: ${error.message}`);
  if (user) return user.id;

  // Insert new user if not found
  const { data: created, error: createErr } = await supabase
    .from('users')
    .insert({ email })
    .select('id')
    .single();

  if (createErr) throw new Error(`Failed to create user: ${createErr.message}`);
  return created?.id ?? null;
}
