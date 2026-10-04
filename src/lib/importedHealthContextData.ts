import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { summarizeImportedHealthArchive, type ImportedHealthSummary } from "@/lib/importedHealthContext";

export async function loadImportedHealthSummary(supabase: SupabaseClient, userId: string): Promise<ImportedHealthSummary | null> {
  // Use the latest authorized archive, even if a subsequent intake has no archive.
  // The server derives userId from authenticated identity; no email or client-supplied owner lookup.
  const { data, error } = await supabase.from("submissions")
    .select("id,raw_payload")
    .eq("user_id", userId)
    .eq("raw_payload->>schema_version", "member_source_archive_v1")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error("Unable to load private imported health context.");
  return data ? summarizeImportedHealthArchive(data.raw_payload, data.id) : null;
}
