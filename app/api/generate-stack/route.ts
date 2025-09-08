// lve360-app/app/api/generate-stack/route.ts/

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

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: '/api/generate-stack',
    method: 'POST',
    body: '{ "email"?: string, "user_id"?: string }',
    note: 'Generates a stack from the latest submission (filtered by user_id or email) and upserts into `stacks`.',
  });
}

export async function POST(request: Request) {
  try {
    assertEnv();
    const { email, user_id } = await safeJson<{ email?: string; user_id?: string }>(request);
    const supabase = supabaseAdmin();

    let submission;

    if (user_id) {
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

    const items = await generateStack(submission);

    const generated = {
      items: items ?? [],
      summary: null,
      version: 'v1',
      totalMonthlyCost: null,
      notes: null,
    };

    const resolvedUserId = user_id ?? (await findOrCreateUserIdForEmail(supabase, submission.email ?? email));

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

// Helper functions as you have them…
