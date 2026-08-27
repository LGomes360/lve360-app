import { NextResponse } from "next/server";

import { blueprintInputSnapshotHash } from "@/lib/blueprintWorkspace";
import { blueprintMarkdownFromStack } from "@/lib/blueprintSafetyStatus";
import { ensureCurrentRegimen } from "@/lib/currentRegimen";
import { recordProductEventSafely } from "@/lib/productAnalytics";
import { sendGeneratedBlueprintEmail } from "@/lib/reportEmail";
import { requirePaidApi } from "@/lib/serverEntitlements";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;
export const fetchCache = "force-no-store";
export const revalidate = 0;

type RouteContext = { params: Promise<{ stackId: string }> };

const STACK_ITEM_CLONE_COLUMNS = [
  "supplement_id", "user_id", "name", "brand", "dose", "timing", "notes",
  "rationale", "caution", "citations", "cost_estimate", "link_amazon",
  "link_thorne", "link_fullscript", "link_other", "link_type", "is_custom",
  "user_email", "refill_days_left", "last_refilled_at", "is_current",
  "timing_bucket", "timing_text",
].join(",");

async function cloneBlueprintVersion(
  admin: ReturnType<typeof getSupabaseAdmin>,
  source: Record<string, any>,
  supersedesStackId: string,
): Promise<string> {
  if (!Object.prototype.hasOwnProperty.call(source, "snapshot_occurrence")) {
    throw new Error("blueprint_repeat_versioning_unavailable");
  }

  const { data: newestOccurrence, error: occurrenceError } = await admin
    .from("stacks")
    .select("snapshot_occurrence")
    .eq("submission_id", source.submission_id)
    .eq("user_id", source.user_id)
    .eq("input_snapshot_hash", source.input_snapshot_hash)
    .order("snapshot_occurrence", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (occurrenceError) throw occurrenceError;

  const nextOccurrence = Math.max(1, Number(newestOccurrence?.snapshot_occurrence ?? 1) + 1);
  const now = new Date().toISOString();
  const sourceSections = source.sections && typeof source.sections === "object" && !Array.isArray(source.sections)
    ? source.sections
    : null;
  const clone = {
    submission_id: source.submission_id,
    user_id: source.user_id,
    user_email: source.user_email,
    tally_submission_id: source.tally_submission_id,
    version: source.version,
    tokens_used: 0,
    prompt_tokens: 0,
    completion_tokens: 0,
    safety_status: source.safety_status,
    safety_warnings: source.safety_warnings ?? [],
    summary: source.summary,
    sections: sourceSections ? { ...sourceSections, generated_at: now, reused_from_stack_id: source.id } : source.sections,
    items: source.items ?? [],
    notes: source.notes,
    total_monthly_cost: source.total_monthly_cost,
    input_snapshot_hash: source.input_snapshot_hash,
    snapshot_occurrence: nextOccurrence,
    generation_reason: "member-refresh-reused",
    supersedes_stack_id: supersedesStackId,
    safety_acknowledged_at: null,
  };

  const { data: inserted, error: insertError } = await admin
    .from("stacks")
    .insert(clone)
    .select("id")
    .single();
  if (insertError) throw insertError;

  const clonedStackId = String(inserted.id);
  const { data: sourceItems, error: sourceItemsError } = await admin
    .from("stacks_items")
    .select(STACK_ITEM_CLONE_COLUMNS)
    .eq("stack_id", source.id);
  if (sourceItemsError) {
    await admin.from("stacks").delete().eq("id", clonedStackId);
    throw sourceItemsError;
  }

  if (sourceItems?.length) {
    const { error: itemInsertError } = await admin
      .from("stacks_items")
      .insert(sourceItems.map((item) => ({ ...(item as unknown as Record<string, unknown>), stack_id: clonedStackId })));
    if (itemInsertError) {
      await admin.from("stacks").delete().eq("id", clonedStackId);
      throw itemInsertError;
    }
  }

  return clonedStackId;
}

export async function POST(_req: Request, { params }: RouteContext) {
  const entitlement = await requirePaidApi();
  if (!entitlement.ok) return entitlement.response;

  const admin = getSupabaseAdmin();
  let submissionId: string | null = null;

  try {
    const { stackId } = await params;
    const { data: selected, error: stackError } = await admin
      .from("stacks")
      .select("*")
      .eq("id", stackId)
      .eq("user_id", entitlement.user.id)
      .maybeSingle();
    if (stackError) throw stackError;
    if (!selected?.submission_id) {
      return NextResponse.json({ ok: false, error: "blueprint_not_found" }, { status: 404 });
    }
    if (!Object.prototype.hasOwnProperty.call(selected, "input_snapshot_hash")) {
      return NextResponse.json({ ok: false, error: "blueprint_versioning_unavailable" }, { status: 503 });
    }
    submissionId = selected.submission_id;

    const { data: submission, error: submissionError } = await admin
      .from("submissions")
      .select("id, user_id, user_email, engine_input_json, answers, payload_json")
      .eq("id", submissionId)
      .eq("user_id", entitlement.user.id)
      .maybeSingle();
    if (submissionError) throw submissionError;
    if (!submission) {
      return NextResponse.json({ ok: false, error: "blueprint_not_found" }, { status: 404 });
    }

    const currentRegimen = await ensureCurrentRegimen(entitlement.user.id, submission.id, submission);
    const inputSnapshotHash = blueprintInputSnapshotHash(submission, currentRegimen);
    const { data: existing, error: existingError } = await admin
      .from("stacks")
      .select("*")
      .eq("submission_id", submission.id)
      .eq("user_id", entitlement.user.id)
      .eq("input_snapshot_hash", inputSnapshotHash)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingError) throw existingError;

    const { data: latest, error: latestError } = await admin
      .from("stacks")
      .select("id")
      .eq("submission_id", submission.id)
      .eq("user_id", entitlement.user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestError) throw latestError;

    await recordProductEventSafely({
      user_id: entitlement.user.id,
      event_name: "blueprint_refresh_started",
      source: "blueprints",
    });

    if (existing?.id) {
      const refreshedStackId = await cloneBlueprintVersion(
        admin,
        existing as Record<string, any>,
        latest?.id ?? selected.id,
      );
      const markdown = blueprintMarkdownFromStack(existing);
      if (markdown.trim()) {
        await sendGeneratedBlueprintEmail({
          to: submission.user_email,
          submissionId: submission.id,
          stackId: refreshedStackId,
          markdown,
          generationSource: "blueprint-refresh",
        });
      }
      await recordProductEventSafely({
        user_id: entitlement.user.id,
        event_name: "blueprint_refresh_completed",
        source: "blueprints",
      });
      return NextResponse.json({ ok: true, stack_id: refreshedStackId, reused: true });
    }

    const { generateStackForSubmission } = await import("@/lib/generateStack");
    const result = await generateStackForSubmission(submission.id, {
      mode: "premium",
      inputSnapshotHash,
      generationReason: "member-refresh",
      supersedesStackId: latest?.id ?? selected.id,
    });
    const refreshedStackId = typeof result?.raw?.stack_id === "string" ? result.raw.stack_id : null;
    if (!refreshedStackId) throw new Error("refreshed_blueprint_not_persisted");

    if (typeof result?.markdown === "string" && result.markdown.trim()) {
      await sendGeneratedBlueprintEmail({
        to: submission.user_email,
        submissionId: submission.id,
        stackId: refreshedStackId,
        markdown: result.markdown,
        generationSource: "blueprint-refresh",
      });
    }

    await recordProductEventSafely({
      user_id: entitlement.user.id,
      event_name: "blueprint_refresh_completed",
      source: "blueprints",
    });

    return NextResponse.json({ ok: true, stack_id: refreshedStackId, reused: false });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const validationFailed = errorMessage.startsWith("Refusing to persist health-item integrity failure:");
    console.error("[blueprints/refresh] failed", {
      submissionId,
      message: errorMessage,
    });
    await recordProductEventSafely({
      user_id: entitlement.user.id,
      event_name: "blueprint_refresh_failed",
      source: "blueprints",
    });
    return NextResponse.json(
      { ok: false, error: validationFailed ? "blueprint_refresh_validation_failed" : "blueprint_refresh_failed" },
      { status: 500 }
    );
  }
}
