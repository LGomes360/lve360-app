// src/lib/getSubmissionWithChildren.ts
// Server-side helper: fetch a submission and its child rows using the admin client.
// Minimal, no TypeScript type imports to avoid module resolution issues during CI.
// Returns a plain JS object (any) to keep downstream callers working.

import { supabaseAdmin } from './supabaseAdmin';

export async function getSubmissionWithChildren(submissionId: string): Promise<any> {
  // 1) Parent submission
  const { data: submission, error: parentErr } = await supabaseAdmin
    .from('submissions')
    .select('*')
    .eq('id', submissionId)
    .single();

  if (parentErr || !submission) {
    throw parentErr ?? new Error(`Submission not found: ${submissionId}`);
  }

  // 2) Child queries in parallel
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

  // 3) Fail fast on child errors
  if (medsRes.error || suppsRes.error || hormRes.error) {
    throw medsRes.error ?? suppsRes.error ?? hormRes.error;
  }

  const medications = medsRes.data ?? [];
  const supplements = suppsRes.data ?? [];
  const hormones = hormRes.data ?? [];

  // Keep both short and canonical keys to preserve compatibility
  return {
    ...submission,
    medications,
    supplements,
    hormones,
    submission_medications: medications,
    submission_supplements: supplements,
    submission_hormones: hormones
  };
}
