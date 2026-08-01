import "server-only";

import { getSubmissionWithChildren } from "@/lib/getSubmissionWithChildren";
import { buildNormalizedCurrentStackLedger } from "@/lib/normalizedCurrentStackLedger";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import {
  ledgerToRegimenRows,
  normalizeRegimenName,
  regimenKindForSupplement,
  regimenToLedger,
  type CurrentRegimenItem,
  type CurrentRegimenSource,
} from "@/lib/currentRegimenModel";
import type { MedicationInstructionAuthority } from "@/lib/medicationRecord";
import { regimenScheduleLabel, type RegimenSchedule } from "@/lib/regimenSchedule";
import { normalizeHttpsUrl, type SupplementProductSource } from "@/lib/supplementProduct";

const REGIMEN_COLUMNS = "id,user_id,source_submission_id,source_stack_item_id,item_kind,name,normalized_name,purpose,dose,timing,schedule,brand,reorder_url,image_url,product_source,product_sku,instruction_source,instruction_authority,active,created_at,updated_at";

export async function getCurrentRegimen(userId: string, includeInactive = false): Promise<CurrentRegimenItem[]> {
  const admin = getSupabaseAdmin();
  let query = admin.from("current_regimen_items").select(REGIMEN_COLUMNS).eq("user_id", userId);
  if (!includeInactive) query = query.eq("active", true);
  const { data, error } = await query.order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as CurrentRegimenItem[];
}

export async function ensureCurrentRegimen(userId: string, submissionId: string, submission?: unknown) {
  const existing = await getCurrentRegimen(userId, true);
  if (existing.length) return regimenToLedger(existing);

  const source = submission ?? await getSubmissionWithChildren(submissionId);
  const ledger = buildNormalizedCurrentStackLedger(source);
  if (!ledger.length) return ledger;
  const { data, error } = await getSupabaseAdmin()
    .from("current_regimen_items")
    .upsert(ledgerToRegimenRows(ledger, userId, submissionId), { onConflict: "user_id,item_kind,normalized_name" })
    .select(REGIMEN_COLUMNS);
  if (error) throw error;
  return regimenToLedger((data ?? []) as unknown as CurrentRegimenItem[]);
}

async function ensureLatestUserRegimen(userId: string) {
  const existing = await getCurrentRegimen(userId, true);
  if (existing.length) return;
  const { data, error } = await getSupabaseAdmin().from("submissions")
    .select("id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (data?.id) await ensureCurrentRegimen(userId, data.id);
}

type SupplementInput = {
  name: string;
  dose?: string | null;
  timing?: string | null;
  brand?: string | null;
  reorder_url?: string | null;
  image_url?: string | null;
  product_source?: SupplementProductSource | null;
  product_sku?: string | null;
  active?: boolean;
};

export async function replaceCurrentSupplements(
  userId: string,
  submissionId: string,
  supplements: SupplementInput[]
) {
  const admin = getSupabaseAdmin();
  await ensureCurrentRegimen(userId, submissionId);
  const existing = await getCurrentRegimen(userId, true);
  const existingProducts = new Map(
    existing
      .filter((item) => item.item_kind === "supplement" || item.item_kind === "endocrine_active_supplement")
      .map((item) => [item.normalized_name, item])
  );
  const now = new Date().toISOString();
  const { error: deactivateError } = await admin
    .from("current_regimen_items")
    .update({ active: false, updated_at: now })
    .eq("user_id", userId)
    .in("item_kind", ["supplement", "endocrine_active_supplement"]);
  if (deactivateError) throw deactivateError;

  const active = supplements.filter((item) => item.active !== false);
  if (active.length) {
    const rows = active.map((item) => {
      const previous = existingProducts.get(normalizeRegimenName(item.name));
      return {
        user_id: userId,
        source_submission_id: submissionId,
        source_stack_item_id: null,
        item_kind: regimenKindForSupplement(item.name),
        name: item.name,
        normalized_name: normalizeRegimenName(item.name),
        purpose: null,
        dose: item.dose ?? null,
        timing: item.timing ?? null,
        brand: item.brand ?? previous?.brand ?? null,
        reorder_url: item.reorder_url ?? previous?.reorder_url ?? null,
        image_url: item.image_url ?? previous?.image_url ?? null,
        product_source: item.product_source ?? previous?.product_source ?? null,
        product_sku: item.product_sku ?? previous?.product_sku ?? null,
        instruction_source: "member_update" satisfies CurrentRegimenSource,
        active: true,
        updated_at: now,
      };
    });
    const { error } = await admin.from("current_regimen_items")
      .upsert(rows, { onConflict: "user_id,item_kind,normalized_name" });
    if (error) throw error;
  }
  return getCurrentRegimen(userId);
}

export async function adoptStackRecommendation(userId: string, stackItemId: string) {
  const admin = getSupabaseAdmin();
  await ensureLatestUserRegimen(userId);
  const { data: item, error } = await admin.from("stacks_items")
    .select("id,user_id,name,brand,dose,timing,timing_text,rationale,link_fullscript,link_amazon")
    .eq("id", stackItemId).eq("user_id", userId).maybeSingle();
  if (error) throw error;
  if (!item) return null;
  let reorderUrl: string | null = null;
  try { reorderUrl = normalizeHttpsUrl(item.link_fullscript ?? item.link_amazon ?? null); } catch { reorderUrl = null; }
  const row = {
    user_id: userId,
    source_submission_id: null,
    source_stack_item_id: item.id,
    item_kind: regimenKindForSupplement(item.name),
    name: item.name,
    normalized_name: normalizeRegimenName(item.name),
    purpose: item.rationale ?? null,
    dose: item.dose ?? null,
    timing: item.timing_text ?? item.timing ?? null,
    brand: item.brand ?? null,
    reorder_url: reorderUrl,
    image_url: null,
    product_source: reorderUrl ? (item.link_fullscript ? "fullscript" : "fallback") : null,
    product_sku: null,
    instruction_source: "adopted_recommendation" satisfies CurrentRegimenSource,
    active: true,
    updated_at: new Date().toISOString(),
  };
  const { data, error: upsertError } = await admin.from("current_regimen_items")
    .upsert(row, { onConflict: "user_id,item_kind,normalized_name" }).select(REGIMEN_COLUMNS).maybeSingle();
  if (upsertError) throw upsertError;
  return data as unknown as CurrentRegimenItem;
}

export async function upsertManualRegimenItem(userId: string, input: SupplementInput) {
  await ensureLatestUserRegimen(userId);
  const row = {
    user_id: userId,
    source_submission_id: null,
    source_stack_item_id: null,
    item_kind: regimenKindForSupplement(input.name),
    name: input.name,
    normalized_name: normalizeRegimenName(input.name),
    purpose: null,
    dose: input.dose ?? null,
    timing: input.timing ?? null,
    brand: input.brand ?? null,
    reorder_url: input.reorder_url ?? null,
    image_url: input.image_url ?? null,
    product_source: input.product_source ?? null,
    product_sku: input.product_sku ?? null,
    instruction_source: "manual_add" satisfies CurrentRegimenSource,
    active: input.active !== false,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await getSupabaseAdmin().from("current_regimen_items")
    .upsert(row, { onConflict: "user_id,item_kind,normalized_name" }).select(REGIMEN_COLUMNS).maybeSingle();
  if (error) throw error;
  return data as unknown as CurrentRegimenItem;
}

export async function upsertReportedMedication(userId: string, input: {
  name: string;
  dose: string | null;
  timing: string | null;
  purpose: string | null;
  instruction_authority: MedicationInstructionAuthority;
  schedule?: RegimenSchedule | null;
}) {
  await ensureLatestUserRegimen(userId);
  const row = {
    user_id: userId,
    source_submission_id: null,
    source_stack_item_id: null,
    item_kind: "medication" as const,
    name: input.name,
    normalized_name: normalizeRegimenName(input.name),
    purpose: input.purpose,
    dose: input.dose,
    timing: input.schedule ? regimenScheduleLabel(input.schedule) : input.timing,
    schedule: input.schedule ?? null,
    instruction_source: "manual_add" satisfies CurrentRegimenSource,
    instruction_authority: input.instruction_authority,
    active: true,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await getSupabaseAdmin().from("current_regimen_items")
    .upsert(row, { onConflict: "user_id,item_kind,normalized_name" })
    .select(REGIMEN_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  return data as unknown as CurrentRegimenItem;
}

export async function upsertReportedHormone(userId: string, input: {
  name: string;
  dose: string | null;
  timing: string | null;
  purpose: string | null;
  instruction_authority: MedicationInstructionAuthority;
  schedule?: RegimenSchedule | null;
}) {
  await ensureLatestUserRegimen(userId);
  const row = {
    user_id: userId,
    source_submission_id: null,
    source_stack_item_id: null,
    item_kind: "hormone" as const,
    name: input.name,
    normalized_name: normalizeRegimenName(input.name),
    purpose: input.purpose,
    dose: input.dose,
    timing: input.schedule ? regimenScheduleLabel(input.schedule) : input.timing,
    schedule: input.schedule ?? null,
    instruction_source: "manual_add" satisfies CurrentRegimenSource,
    instruction_authority: input.instruction_authority,
    active: true,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await getSupabaseAdmin().from("current_regimen_items")
    .upsert(row, { onConflict: "user_id,item_kind,normalized_name" })
    .select(REGIMEN_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  return data as unknown as CurrentRegimenItem;
}
