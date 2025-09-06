// app/api/generate-stack/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { assertEnv } from '../../../src/lib/env';
import { generateStack } from '../../../src/lib/generateStack';

export const dynamic = 'force-dynamic';

type Submission = {
  id: string;
  email?: string | null;
  created_at: string;
  // add any fields your generateStack relies on
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

function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!; // server-only
  return createClient(url, key);
}

export async function POST(request: Request) {
  try {
    assertEnv();

    // Body is optional: { "email": "user@example.com" }
    const { email } = await safeJson(request);

    const supabase = supabaseAdmin();

    // 1) Latest submission (optionally by email)
    const submission = await getLatestSubmission(supabase, email);
    if (!submission) {
      return NextResponse.json(
        { ok: false, error: email ? `No submissions found for ${email}` : 'No submissions found' },
        { status: 404 }
      );
    }

    // 2) Generate the stack
    const generated: GeneratedStack = await generateStack(submission as any);

    // 3) Ensure user row (optional)
    const userId = await findOrCreateUserIdForEmail(supabase, submission.email ?? email);

    // 4) Upsert idempotently on submission_id
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

// -------- helpers --------

async function safeJson(req: Request): Promise<{ email?: string }> {
  try {
    const len = req.headers.get('content-length');
    if (!len || len === '0') return {};
    return (await req.json()) as { email?: string };
  } catch {
    return {};
  }
}

async function getLatestSubmission(supabase: ReturnType<typeof supabaseAdmin>, email?: string) {
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
    .sel
