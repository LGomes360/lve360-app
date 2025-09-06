// app/api/generate-stack/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { assertEnv } from '../../../src/lib/env';
import { generateStack } from '../../../src/lib/generateStack';

export const dynamic = 'force-dynamic';

// —— Types (align with your schema as needed)
type Submission = {
  id: string;
  email?: string | null;
  created_at: string;
  // include any fields your generateStack reads
  // answers?: Record<string, unknown>;
};

type GeneratedStack = {
  items: Array<{
    name: string;
    dose?: string;
    schedule?: string;
    rationale?: string;
    affiliateUrl?: string;
    monthlyCost?: number;
  }>;
  summary?: string;
  version?: string;
  totalMonthlyCost?: number;
  notes?: string;
};

// —— Supabase admin client (server-only key)
function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!; // never expose to client
  return createClient(url, key);
}

/**
 * POST /api/generate-stack
 * Body (optional): { "email": "user@example.com" }
 *
 * Flow:
 * 1) Fetch latest submission (global or by email)
 * 2) generateStack(submission)
 * 3) Upsert into stacks on conflict submission_id (idempotent)
 */
export async function POST(request: Request) {
  try {
    assertEnv();

    const { email } = await safeJson<{ email?: string }>(request);
    const supabase = supabaseAdmin();

    // 1) Latest submission
    const submission = await getLatestSubmission(supabase, email);
    if (!submission) {
      return NextResponse.json(
        { ok: false, error: email ? `No submissions found for ${email}` : 'No submissions found' },
        { status: 404 }
      );
    }

    // 2) Generate stack
    const generated: GeneratedStack = await generateStack(submission as any);

    // 3) Ensure user row (optional convenience)
    const userId = await findOrCreateUserIdForEmail(supabase, submission.email ?? email);

    // 4) Upsert by submission_id
    const stackRow = {
      submission_id: submission.id,
      user_id: userId ?? null,
      email: submission.email ?? email ?? null,
      items: generated.items ?? [],
      summary: generated.summary ?? null,
      version: generated.version ?? 'v1',
      total_monthly_cost: generated.totalMonthlyCost ?? null,
      notes: generated.notes ?? null,
    };

    const { data: upserted, error: upsertErr } = await supabase
      .from('stacks')
      .upsert(stackRow, { onConflict: 'submission_id' })
      .select()
      .limit(1)
      .maybeSingle();

    if (upsertErr) {
      return NextResponse.json({ ok: false, error: upsertErr.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      submission_id: submission.id,
      stack_id: upserted?.id ?? null,
      items_preview: (generated.items ?? []).slice(0, 5),
      meta: { email: submission.email ?? email ?? null, version: generated.version ?? 'v1' },
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message ?? 'Unknown server error' }, { status: 500 });
  }
}

// —— Helpers

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
): Promise<Submission | null> {
  let query = supabase.from('submissions').select('*').order('created_at', { ascending: false }).limit(1);
  if (email) query = query.eq('email', email);
  const { data, error } = await query;
  if (error) throw new Error(`Failed to fetch latest submission: ${error.message}`);
  return (data?.[0] ?? null) as Submission | null;
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
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Failed to query users: ${error.message}`);
  if (user?.id) return user.id as string;

  const { data: created, error: insertErr } = await supabase
    .from('users')
    .insert({ email, tier: 'free' })
    .select('id')
    .limit(1)
    .maybeSingle();

  if (insertErr) throw new Error(`Failed to create user: ${insertErr.message}`);
  return created?.id ?? null;
}
