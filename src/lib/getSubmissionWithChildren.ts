// src/lib/getSubmissionWithChildren.ts
// Robust helper: returns a Submission + its child rows.
// - Typed against Database from '@/types/supabase'.
// - Uses supabaseAdmin (service-role client).
// - Never instantiates clients at import-time beyond existing shared clients.

import { supabaseAdmin } from "@/lib/supabase";
import type { Database } from "@/types/supabase";

export type SubmissionRow = Database["public"]["Tables"]["submissions"]["Row"];
export type SubmissionMedicationRow = Database["public"]["Tables"]["submission_medications"]["Row"];
export type SubmissionSupplementRow = Database["public"]["Tables"]["submission_supplements"]["Row"];
export type SubmissionHormoneRow = Database["public"]["Tables"]["submission_hormones"]["Row"];

export type SubmissionWithChildren = SubmissionRow & {
  medications: SubmissionMedicationRow[];
  supplements: SubmissionSupplementRow[];
  hormones: SubmissionHormoneRow[];
};

export async function getSubmissionWithChildren(submissionId: string): Promise<SubmissionWithChildren> {
  if (!submissionId) throw new Error("submissionId is required");

  // Fetch the parent submission
  const { data: submission, error: parentErr } = await supabaseAdmin
    .from("submissions")
    .select("*")
    .eq("id", submissionId)
    .single();

  if (parentErr) {
    throw new Error(`Failed to fetch submission ${submissionId}: ${parentErr.message}`);
  }
  if (!submission) {
    throw new Error(`Submission ${submissionId} not found`);
  }

  // Fetch child rows in parallel
  const [medResp, supResp, horResp] = await Promise.all([
    supabaseAdmin.from("submission_medications").select("*").eq("submission_id", submissionId),
    supabaseAdmin.from("submission_supplements").select("*").eq("submission_id", submissionId),
    supabaseAdmin.from("submission_hormones").select("*").eq("submission_id", submissionId),
  ]);

  if (medResp.error) throw new Error(`Failed to fetch medications: ${medResp.error.message}`);
  if (supResp.error) throw new Error(`Failed to fetch supplements: ${supResp.error.message}`);
  if (horResp.error) throw new Error(`Failed to fetch hormones: ${horResp.error.message}`);

  return {
    ...submission,
    medications: medResp.data ?? [],
    supplements: supResp.data ?? [],
    hormones: horResp.data ?? [],
  };
}

export default getSubmissionWithChildren;
