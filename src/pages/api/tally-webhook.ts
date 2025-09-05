import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { generateStack } from '../../lib/generateStack';

// Instantiate an admin Supabase client with the service role key. This allows
// the endpoint to insert into and read from tables with row level security.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  { auth: { persistSession: false } }
);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end('Method Not Allowed');
  }
  try {
    const submission = req.body;
    const userEmail: string = submission.userEmail;
    if (!userEmail) {
      return res.status(400).json({ error: 'Missing user email' });
    }

    // Persist the raw submission. We store the payload for auditing and
    // debugging. This assumes a `submissions` table with columns
    // { id, user_email, payload }.
    const { data: submissionRow, error: submissionError } = await supabase
      .from('submissions')
      .insert({ user_email: userEmail, payload: submission })
      .select('id')
      .single();
    if (submissionError || !submissionRow) {
      console.error(submissionError);
      return res.status(500).json({ error: 'Failed to persist submission' });
    }

    // Generate a personalized stack based on the submission. We pass through
    // the goals, health conditions, medications and tier values. Unrecognized
    // fields are ignored.
    const stackItems = await generateStack({
      goals: submission.goals,
      healthConditions: submission.healthConditions,
      medications: submission.medications,
      tier: submission.tier,
    });

    // Insert a new stack row. The `stacks` table should have at least
    // { id, user_email, created_at } columns.
    const { data: stackRow, error: stackError } = await supabase
      .from('stacks')
      .insert({ user_email: userEmail })
      .select('id')
      .single();
    if (stackError || !stackRow) {
      console.error(stackError);
      return res.status(500).json({ error: 'Failed to create stack' });
    }

    // Prepare the rows for `stacks_items`. Each item links the stack to a
    // specific supplement along with the recommended dose and optional note.
    const stackItemsData = stackItems.map((item) => ({
      stack_id: stackRow.id,
      supplement_id: item.supplement_id,
      dose: item.dose,
      note: item.notes,
    }));
    // Insert the items if any exist. It is safe to insert an empty array but
    // Supabase will error, so guard the call.
    if (stackItemsData.length > 0) {
      const { error: itemsError } = await supabase
        .from('stacks_items')
        .insert(stackItemsData);
      if (itemsError) {
        console.error(itemsError);
        // continue but report the error in the response
        return res.status(500).json({ error: 'Failed to save stack items' });
      }
    }

    // Return success. The client can hit the /results page to fetch the stack.
    return res.status(200).json({ status: 'success' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal error' });
  }
}