import { NextResponse } from "next/server";

import { ensureCurrentRegimen, getCurrentRegimen } from "@/lib/currentRegimen";
import { normalizeRegimenName } from "@/lib/currentRegimenModel";
import { requirePaidApi } from "@/lib/serverEntitlements";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const entitlement = await requirePaidApi();
  if (!entitlement.ok) return entitlement.response;

  try {
    const userId = entitlement.user.id;
    const admin = getSupabaseAdmin();
    const { data: latestStack, error: stackError } = await admin
      .from("stacks")
      .select("id,submission_id,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (stackError) throw stackError;

    if (latestStack?.submission_id) {
      await ensureCurrentRegimen(userId, latestStack.submission_id);
    }
    const regimen = await getCurrentRegimen(userId);
    const currentNames = new Set(regimen.map((item) => normalizeRegimenName(item.name)));
    const current = regimen.map((item) => ({
      id: item.id,
      stack_id: latestStack?.id ?? null,
      user_id: item.user_id,
      name: item.name,
      brand: null,
      dose: item.dose,
      timing: item.timing,
      timing_text: item.timing,
      timing_bucket: null,
      notes: `Current ${item.item_kind.replaceAll("_", " ")}. Instruction source: ${item.instruction_source}.`,
      is_current: true,
      item_kind: item.item_kind,
      source_type: "regimen",
      link_amazon: null,
      link_fullscript: null,
      refill_days_left: null,
      last_refilled_at: null,
      supplement_id: null,
      created_at: item.created_at ?? item.updated_at ?? null,
    }));

    let proposals: any[] = [];
    if (latestStack?.id) {
      const { data, error } = await admin.from("stacks_items")
        .select("id,stack_id,user_id,name,brand,dose,timing,timing_text,timing_bucket,notes,is_current,link_amazon,link_fullscript,refill_days_left,last_refilled_at,supplement_id,created_at")
        .eq("stack_id", latestStack.id)
        .eq("is_current", false);
      if (error) throw error;
      proposals = (data ?? [])
        .filter((item) => !currentNames.has(normalizeRegimenName(item.name ?? "")))
        .map((item) => ({ ...item, source_type: "blueprint_proposal" }));
    }

    return NextResponse.json({ ok: true, latestStack: latestStack ?? null, items: [...current, ...proposals] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "current_regimen_failed";
    console.error("[stacks/combined] failed", error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
