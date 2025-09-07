import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { generateStack } from '@/lib/generateStack';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const id = req.query.id as string;
  if (!id) {
    res.status(400).json({ error: 'Missing id param' });
    return;
  }

  // Fetch the main submission
  const { data: submission, error } = await supabase
    .from('submissions')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !submission) {
    res.status(404).json({ error: 'Submission not found' });
    return;
  }

  // Fetch child tables (medications, supplements, hormones) for this submission
  const { data: meds } = await supabase
    .from('submission_medications')
    .select('*')
    .eq('submission_id', id);

  const { data: supps } = await supabase
    .from('submission_supplements')
    .select('*')
    .eq('submission_id', id);

  const { data: hormones } = await supabase
    .from('submission_hormones')
    .select('*')
    .eq('submission_id', id);

  // Add them to the submission object for generateStack
  const fullSubmission = {
    ...submission,
    medications: meds ?? [],
    supplements: supps ?? [],
    hormones: hormones ?? [],
  };

  // Call your generateStack function!
  const stack = await generateStack(fullSubmission);

  res.status(200).json(stack);
}
