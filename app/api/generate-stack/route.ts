// app/api/generate-stack/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { assertEnv } from '../../../src/lib/env';
import { generateStack } from '../../../src/lib/generateStack';

export const dynamic = 'force-dynamic';

// ---- Types (adjust to your schema if needed)
type Submission = {
  id: string;
  email?: string | null;
  created_at: string;
  // add other fields generateStack reads
};

type StackItem = {
  name: string;
  dose?: string;
  schedule?: string;
  rationale?: string;
  affiliateUrl?: string;
  monthlyCost?: number;
};

type GeneratedStack = {
  items: StackItem[];
  summary?: string | null;
  version?: string | null;
  totalMonthlyCost?: number | null;
  notes?: string | null;
};

// ---- Supabase admin client (server-only key)
function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!; // server-only, never expose to client
  return createClient(url, key);
}

// ---- GET: human-friendly status so you can hit in a browser
export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: '/api/generate-stack',
    method: 'POST',
    body: '{ "email"?: string }',
    note: 'Generates a stack from the latest submission (optionally filtered by email) and upserts into `stacks`.',
  });
}

// ---- POST: main generator
export async function POST(request: Request) {
  try {
    assertEnv();

    const { email } = await safeJson<{ email?: string }>(request);
    const supabase = supabaseAdmin();

    // 1) Fetch latest submission (optionally by email)
    const submission = await getLatestSubmission(supabase, email);
    if (!submission) {
      return NextResponse.json(
        { ok: false, error: email ? `No submissions found for ${email}` : 'No submissions found' },
        { status: 404 }
      );
    }

    // 2) Generate items (generateStack currently returns StackItem[])
    const items: StackItem[] = await generateStack(submission as any);

    // Wrap into our canonical payload shape
    const generated: GeneratedStack = {
      items: items ?? [],
      summary: null,
      version: 'v1',
      totalMonthlyCost: null,
      notes: null,
    };

    // 3) Ensure a user row (optional convenience)
    const userId = await findOrCreateUserIdForEmail(supabase, submission.email ?? email);

    // 4) Upsert idempotently on submission_id
    const stackRow = {
      submission_id: submission.id,
      user_id: userId ?? null,
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
      .limit(1)
      .maybeSingle();

    if (upsertErr) {
      return NextResponse.json({ ok: false, error: upsertErr.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      submission_id: submission.id,
      stack_id: upserted?.id ?? null,
      items_preview: generated.items.slice(0, 5),
      meta: { email: submission.email ?? email ?? null, version: generated.version ?? 'v1' },
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message ?? 'Unknown server error' }, { status: 500 });
  }
}

// ---- Helpers
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
