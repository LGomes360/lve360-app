import { NextResponse } from 'next/server';
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
 * GET returns route info only (no-op for users, useful for Postman/test).
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
 * POST: Main endpoint for generating and saving a stack.
 * Requires: email OR user_id.
 * 1. Find latest submission for user (by user_id or email)
 * 2. Run stack engine (LLM + rules)
 * 3. Upsert stack, always setting user_id.
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
        .eq('user_id', user_id) // CORRECT: filter submissions by user_id
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw new Error(`Failed to fetch submission for user_id ${user_id}: ${error.message}`);
      if (!data) {
        return NextResponse.json({ ok: false, error: `No submissions found for user_id ${user_id}` }, { status: 404 });
      }
      submission = data;
    } else {
      // Fallback: use latest submission for email
      submission = await getLatestSubmission(supabase, email);
      if (!submission) {
        return NextResponse.json(
          { ok: false, error: email ? `No submissions found for ${email}` : 'No submissions found' },
          { status: 404 }
        );
      }
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
      .single(); // Use .single() for upsert/select

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
    return NextResponse.json({ ok: false, error: err?.message ?? 'Unknown server error' }, { status: 500 });
  }
}

// Helpers
async function safeJson<T = unknown>(req: Request): Promise<T | Record<string, never>> {
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
  email?: string
): Promise<any | null> {
  let query = supabase.from('submissions').select('*').order('created_at', { ascending: false }).limit(1);
  if (email) query = query.eq('email', email);
  const { data, error } = await query;
  if (error) throw new Error(`Failed to fetch latest submission: ${error.message}`);
  return (data?.[0] ?? null);
}

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
