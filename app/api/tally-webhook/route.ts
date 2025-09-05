import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import generateStack from '../../../src/lib/generateStack';

export function GET() {
  return NextResponse.json({ ok: true, msg: 'tally-webhook ready' });
}

export async function POST(req: NextRequest) {
  // Bearer token check
  const auth = req.headers.get('authorization') || '';
  const token = auth.replace('Bearer ', '').trim();
  if (token !== process.env.TALLY_WEBHOOK_SECRET) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  try {
    const submission = await req.json();
    const userEmail = submission?.userEmail;
    if (!userEmail) {
      return NextResponse.json({ ok: false, error: 'Missing user email' }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL as string,
      process.env.SUPABASE_SERVICE_ROLE_KEY as string,
      { auth: { persistSession: false } }
    );

    // Persist raw submission
    const { data: submissionRow, error: submissionError } = await supabase
      .from('submissions')
      .insert({ user_email: userEmail, payload: submission })
      .select('id')
      .single();

    if (submissionError || !submissionRow) {
      console.error(submissionError);
      return NextResponse.json({ ok: false, error: 'Failed to persist submission' }, { status: 500 });
    }

    // Generate personalized stack
    const stackItems = await generateStack({
      goals: submission.goals,
      healthConditions: submission.healthConditions,
      medications: submission.medications,
      tier: submission.tier,
    });

    // Insert stack row
    const { data: stackRow, error: stackError } = await supabase
      .from('stacks')
      .insert({
        user_email: userEmail,
        submission_id: submissionRow.id,
      })
      .select('id')
      .single();

    if (stackError || !stackRow) {
      console.error(stackError);
      return NextResponse.json({ ok: false, error: 'Failed to create stack' }, { status: 500 });
    }

    // Prepare rows for stacks_items
    const stackItemsData = stackItems.map((item: any) => ({
      stack_id: stackRow.id,
      supplement_id: item.supplement_id,
      dose: item.dose,
      note: item.notes,
    }));

    // Insert the items if any exist
    if (stackItemsData.length > 0) {
      const { error: itemsError } = await supabase
        .from('stacks_items')
        .insert(stackItemsData);

      if (itemsError) {
        console.error(itemsError);
        return NextResponse.json({ ok: false, error: 'Failed to save stack items' }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true, status: 'success' });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ ok: false, error: 'Internal error' }, { status: 500 });
  }
}
