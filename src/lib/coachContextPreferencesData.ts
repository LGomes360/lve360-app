import "server-only";

import { EXCLUDABLE_COACH_CONTEXT_IDS, isExcludableCoachContextId, type ExcludableCoachContextId } from "./coachPersonalization";
import { getSupabaseAdmin } from "./supabaseAdmin";

function preferenceTableUnavailable(error: { code?: string | null } | null | undefined) {
  return error?.code === "42P01" || error?.code === "PGRST205";
}

export async function getExcludedCoachContextIds(userId: string): Promise<ExcludableCoachContextId[]> {
  const { data, error } = await getSupabaseAdmin().from("ai_coach_context_preferences")
    .select("excluded_source_ids")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    if (preferenceTableUnavailable(error)) return [];
    throw error;
  }
  return Array.isArray(data?.excluded_source_ids)
    ? data.excluded_source_ids.filter(isExcludableCoachContextId)
    : [];
}

export async function setCoachContextPreference(input: {
  userId: string;
  sourceId: ExcludableCoachContextId;
  excluded: boolean;
}) {
  const existing = await getExcludedCoachContextIds(input.userId);
  const next = input.excluded
    ? [...new Set([...existing, input.sourceId])]
    : existing.filter((sourceId) => sourceId !== input.sourceId);
  const ordered = EXCLUDABLE_COACH_CONTEXT_IDS.filter((sourceId) => next.includes(sourceId));
  const { error } = await getSupabaseAdmin().from("ai_coach_context_preferences").upsert({
    user_id: input.userId,
    excluded_source_ids: ordered,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
  if (error) throw error;
  return ordered;
}
