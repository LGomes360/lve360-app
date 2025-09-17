// src/lib/getSubmissionWithChildren.ts
// Fetch a submission and its child rows (meds, supplements, hormones).
// Exports both named and default for compatibility.

import { supabaseAdmin } from "./supabase";

export async function getSubmissionWithChildren(submissionId: string): Promise<any> {
  const { data: submission, error: parentErr } = await supabaseAdmin
    .from("submissions")
    .select("*")
    .eq("id", submissionId)
    .single();

  if (parentErr || !submission) {
    throw parentErr ?? new Error(`Submission not found: ${submissionId}`);
  }

  const [medsRes, suppsRes, hormRes] = await Promise.all([
    supabaseAdmin.from("submission_medications").select("*").eq("submission_id", submissionId),
    supabaseAdmin.from("submission_supplements").select("*").eq("submission_id", submissionId),
    supabaseAdmin.from("submission_hormones").select("*").eq("submission_id", submissionId),
  ]);

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
    submission_hormones: hormones,
  };

  return out;
}

export default getSubmissionWithChildren;

