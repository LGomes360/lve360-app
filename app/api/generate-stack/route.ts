// app/api/generate-stack/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { assertEnv } from '../../../src/lib/env';
import { generateStack } from '../../../src/lib/generateStack';

// ---- Types you likely already have. If so, replace `any` with your actual types.
type Submission = {
  id: string;
  email?: string | null;
  // ... include whatever fields your generateStack reads (age, goals, meds, answers, etc.)
  // answers?: Record<string, any>;
  created_at: string;
};

type GeneratedStack = {
  items: Array<{
    name: string;
    dose?: string;
    schedule?: string;
    rationale?: string;
    affiliateUrl?: string;
    monthlyCost?: number;
    // ... add/adjust as needed
  }>;
  summary?: string;
  version?: string;
  totalMonthlyCost?: number;
  notes?: string;
};

// ---- Utility: create admin client (server-side only: Service Role key)
function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!; // DO NOT expose to client
  return createClient(url, key);
}

/**
 * POST /api/generate-stack
 * Body (optional): { "email": "user@example.com" }
 *
 * Behavior:
 * - If `email` provided, uses the latest submission for that email.
 * - Else, uses the globally latest submission.
 * - Calls generateStack(submission).
 * - Upserts into `stacks` on conflict `submission_id` (idempotent).
 */
export async function POST(request: Request) {
  try {
    assertEnv(); // throws if required env vars are missing

    const { email } = (await safeJson(request)) as { email?: string };

    const supabase = supabaseAdmin();

    // 1) Fetch latest submission (optionally filtered by email)
    const submission = await getLatestSubmission(supabase, email);
    if (!submission) {
      return NextResponse.json(
        { ok: false, error: email ? `No submissions found for ${email}` : 'No submissions found' },
        { status: 404 }
      );
    }

    // 2) Generate the personalized stack
    const generated: GeneratedStack = await generateStack(submission as any);

    // 3) (Optional) find or create a user row so we can associate stacks with users
    const userId = await findOrCreateUserIdForEmail(supabase, submission.email ?? email);

    // 4) Upsert the stack (idempotent by submission_id)
    const stackRow = {
      submission_id: submission.id,
      user_id: userId ?? null,
      email: submission.email ?? email ?? null,
      items: generated.items ?? [],
      summary: generated.summary ?? null,
      version: generated.version ?? 'v1',
      total_monthly_cost: generated.totalMonthlyCost ?? null,
      notes: generated.notes ?? null,
      // created_at/updated_at handled by DB defaults/triggers if you have them
    };

    const { data: upserted, error: upsertErr } = await supabase
      .from('stacks')
      .upsert(stackRow, { onConflict: 'submission_id' }) // ensure your table has a unique index on submission_id
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
    return NextResponse.json(
      { ok: false, error: err?.message ?? 'Unknown server error' },
      { status: 500 }
    );
  }
}

// ---------- helpers ----------

async function safeJson(req: Request) {
  try {
    if (req.headers.get('content-length') === '0') return {};
    return await req.json();
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

  // Try to find existing user
  let { data: user, error } = await supabase
    .from('users')
    .select('id')
    .eq('email', email)
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Failed to query users: ${error.message}`);
  if (user?.id) return user.id as string;

  // Create a lightweight user row (tier defaults to 'free' unless you set otherwise)
  const { data: created, error: insertErr } = await supabase
    .from('users')
    .insert({ email, tier: 'free' })
    .select('id')
    .limit(1)
    .maybeSingle();

  if (insertErr) throw new Error(`Failed to create user: ${insertErr.message}`);
  return created?.id ?? null;
}
