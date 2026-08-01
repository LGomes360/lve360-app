import "server-only";

import { ensureCurrentRegimen, getCurrentRegimen } from "@/lib/currentRegimen";
import { normalizeRegimenName, regimenKindForSupplement } from "@/lib/currentRegimenModel";
import type { RoutineItem } from "@/lib/routine";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function getRoutineData(userId: string): Promise<{
  latestStack: { id: string; submission_id: string | null; created_at: string } | null;
  items: RoutineItem[];
}> {
  const admin = getSupabaseAdmin();
  const { data: latestStack, error: stackError } = await admin
    .from("stacks")
    .select("id,submission_id,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (stackError) throw stackError;

  if (latestStack?.submission_id) await ensureCurrentRegimen(userId, latestStack.submission_id);
  const regimen = await getCurrentRegimen(userId);
  const currentNames = new Set(regimen.map((item) => normalizeRegimenName(item.name)));
  const current: RoutineItem[] = regimen.map((item) => ({
    id: item.id,
    stack_id: latestStack?.id ?? null,
    name: item.name,
    brand: null,
    purpose: item.purpose,
    dose: item.dose,
    timing: item.timing,
    timing_text: item.timing,
    notes: null,
    item_kind: item.item_kind,
    instruction_source: item.instruction_source,
    instruction_authority: item.instruction_authority,
    active: item.active,
    is_current: true,
    source_type: "regimen",
    link_amazon: null,
    link_fullscript: null,
    refill_days_left: null,
    last_refilled_at: null,
    created_at: item.created_at ?? item.updated_at ?? null,
  }));

  let proposals: RoutineItem[] = [];
  if (latestStack?.id) {
    const { data, error } = await admin.from("stacks_items")
      .select("id,stack_id,name,brand,dose,timing,timing_text,notes,rationale,is_current,link_amazon,link_fullscript,refill_days_left,last_refilled_at,created_at")
      .eq("stack_id", latestStack.id)
      .eq("is_current", false);
    if (error) throw error;
    proposals = (data ?? [])
      .filter((item) => !currentNames.has(normalizeRegimenName(item.name ?? "")))
      .map((item) => ({
        id: item.id,
        stack_id: item.stack_id,
        name: item.name,
        brand: item.brand,
        purpose: item.rationale ?? null,
        dose: item.dose,
        timing: item.timing_text ?? item.timing,
        timing_text: item.timing_text,
        notes: item.notes,
        item_kind: regimenKindForSupplement(item.name),
        instruction_source: null,
        instruction_authority: null,
        active: false,
        is_current: false,
        source_type: "blueprint_proposal",
        link_amazon: item.link_amazon,
        link_fullscript: item.link_fullscript,
        refill_days_left: item.refill_days_left,
        last_refilled_at: item.last_refilled_at,
        created_at: item.created_at,
      }));
  }

  return { latestStack: latestStack ?? null, items: [...current, ...proposals] };
}
