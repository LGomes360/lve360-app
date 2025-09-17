// src/lib/getSubmissionWithChildren.ts
// Server-side helper: fetch a submission and its child rows using the admin client.
// Exports both a named export and a default export to satisfy different import styles.

import { supabaseAdmin } from './supabaseAdmin';

/**
 * Fetch a submission and its child rows.
 * Returns a plain JS object (any) to avoid type resolution issues in CI.
 */
export async function getSubmissionWithChildren(submissionId: string): Promise<any> {
  // 1) parent submission
  const { data: submission, error: parentErr } = await supabaseAdmin
    .from('submissions')
    .select('*')
    .eq('id', submissionId)
    .single();

  if (parentErr || !submission) {
    throw parentErr ?? new Error(`Submission not found: ${submissionId}`);
  }

  // 2) children in parallel
  const [medsRes, suppsRes, hormRes] = await Promise.all([
    supabaseAdmin
      .from('submission_medications')
      .select('*')
      .eq('submission_id', submissionId),
    supabaseAdmin
      .from('submission_supplements')
      .select('*')
      .eq('submission_id', submissionId),
    supabaseAdmin
      .from('submission_hormones')
      .select('*')
      .eq('submission_id', submissionId)
  ]);

  // 3) fail fast on child errors
  if (medsRes.error || suppsRes.error || hormRes.error) {
    throw medsRes.error ?? suppsRes.error ?? hormRes.error;
  }

  const medications = medsRes.data ?? [];
  const supplements = suppsRes.data ?? [];
  const hormones = hormRes.data ?? [];

  const out = {
    ...submission,
    medications,
    supplements,
    hormones,
    submission_medications: medications,
    submission_supplements: supplements,
    submission_hormones: hormones
  };

  return out;
}

// Also export default (covers default-import consumers)
export default getSubmissionWithChildren;
