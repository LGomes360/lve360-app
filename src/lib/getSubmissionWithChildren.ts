// src/lib/getSubmissionWithChildren.ts
// Server-side helper: fetch a submission and its child rows using the admin client.
// Returns both short keys (medications/supplements/hormones) and submission_* keys
// so existing code will continue working.

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import type { Database } from '@/types/supabase';

export type SubmissionWithChildren = Database['public']['Tables']['submissions']['Row'] & {
  // short aliases (used in many places)
  medications: Database['public']['Tables']['submission_medications']['Row'][];
  supplements: Database['public']['Tables']['submission_supplements']['Row'][];
  hormones: Database['public']['Tables']['submission_hormones']['Row'][];
  // canonical submission_* names (if other code expects these)
  submission_medications: Database['public']['Tables']['submission_medications']['Row'][];
  submission_supplements: Database['public']['Tables']['submission_supplements']['Row'][];
  submission_hormones: Database['public']['Tables']['submission_hormones']['Row'][];
};

export async function getSubmissionWithChildren(
  submissionId: string
): Promise<SubmissionWithChildren> {
  // 1) Fetch parent row
  const { data: submission, error: subErr } = await supabaseAdmin
    .from('submissions')
    .select('*')
    .eq('id', submissionId)
    .single();

  if (subErr || !submission) {
    // surface helpful error for debugging
    throw subErr ?? new Error(`Submission not found: ${submissionId}`);
  }

  // 2) Fetch children in parallel
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

  // 3) Fail fast if any child query errored
  if (medsRes.error || suppsRes.error || hormRes.error) {
    throw medsRes.error ?? suppsRes.error ?? hormRes.error;
  }

  const medications = medsRes.data ?? [];
  const supplements = suppsRes.data ?? [];
  const hormones = hormRes.data ?? [];

  return {
    ...submission,
    medications,
    supplements,
    hormones,
    // also include canonical keys
    submission_medications: medications,
    submission_supplements: supplements,
    submission_hormones: hormones
  };
}
