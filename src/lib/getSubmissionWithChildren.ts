// src/lib/getSubmissionWithChildren.ts
// Server-side helper: fetch a submission and its child rows using the admin client.
// Uses relative imports to avoid path-alias resolution issues during build.

import { supabaseAdmin } from './supabaseAdmin';
import type { Database } from '../types/supabase';

export type SubmissionWithChildren = Database['public']['Tables']['submissions']['Row'] & {
  medications: Database['public']['Tables']['submission_medications']['Row'][];
  supplements: Database['public']['Tables']['submission_supplements']['Row'][];
  hormones: Database['public']['Tables']['submission_hormones']['Row'][];
  // also include canonical submission_* keys for backward compatibility
  submission_medications: Database['public']['Tables']['submission_medications']['Row'][];
  submission_supplements: Database['public']['Tables']['submission_supplements']['Row'][];
  submission_hormones: Database['public']['Tables']['submission_hormones']['Row'][];
};

export async function getSubmissionWithChildren(
  submissionId: string
): Promise<SubmissionWithChildren> {
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
