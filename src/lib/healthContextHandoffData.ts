import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  healthContextHandoffSelect,
  mapHealthContextHandoffRow,
  type ApprovedHealthContextHandoff,
} from "@/lib/healthContextHandoff";

export async function loadLatestHealthContextHandoff(
  supabase: SupabaseClient,
  userId: string,
): Promise<ApprovedHealthContextHandoff | null> {
  const { data, error } = await supabase
    .from("health_context_handoffs")
    .select(healthContextHandoffSelect())
    .eq("user_id", userId)
    .eq("member_approved", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205" || error.message.includes("schema cache")) return null;
    console.error("[health-context-handoff] load failed", error.message);
    return null;
  }

  return mapHealthContextHandoffRow(data);
}
