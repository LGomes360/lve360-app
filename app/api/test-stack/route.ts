import { NextRequest, NextResponse } from 'next/server'
import { generateStack } from '../../../src/lib/generateStack'
import { createClient } from '@supabase/supabase-js'

function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key);
}

/**
 * GET /api/test-stack?id=<submission_id>
 * Test-only endpoint: fetches a submission by id, runs stack generator, returns stack.
 * No writes or user_id logic needed.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ ok: false, error: 'Missing ?id parameter' }, { status: 400 });
  }

  const supabase = supabaseAdmin();
  const { data: submission, error } = await supabase
    .from('submissions')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error || !submission) {
    return NextResponse.json({ ok: false, error: 'Submission not found' }, { status: 404 });
  }

  const stack = await generateStack(submission as any);

  return NextResponse.json({ ok: true, stack });
}
