import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function getSubmissionWithChildren(submissionId: string) {
  // 1. Fetch parent submission
  const { data: submission, error } = await supabase
    .from('submissions')
    .select('*')
    .eq('id', submissionId)
    .single();
  if (error || !submission) throw new Error('Submission not found');

  // 2. Fetch children
  const { data: medications } = await supabase
    .from('submission_medications')
    .select('*')
    .eq('submission_id', submissionId);

  const { data: supplements } = await supabase
    .from('submission_supplements')
    .select('*')
    .eq('submission_id', submissionId);

  const { data: hormones } = await supabase
    .from('submission_hormones')
    .select('*')
    .eq('submission_id', submissionId);

  return {
    ...submission,
    medications: medications || [],
    supplements: supplements || [],
    hormones: hormones || [],
  };
}
