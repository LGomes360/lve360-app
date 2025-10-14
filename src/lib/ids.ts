import { supabaseAdmin as supa } from "@/lib/supabaseAdmin";

export function isUUID(x: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x);
}

export async function resolveSubmissionId(maybeShortOrUuid?: string): Promise<string | null> {
  if (!maybeShortOrUuid) return null;
  if (isUUID(maybeShortOrUuid)) return maybeShortOrUuid;
  const { data, error } = await supa
    .from("submissions")
    .select("id")
    .eq("tally_submission_id", maybeShortOrUuid)
    .maybeSingle();
  if (error) {
    console.error("[ids.resolveSubmissionId]", error);
    return null;
  }
  return data?.id ?? null;
}
