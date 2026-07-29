import { NextResponse } from "next/server";

import { blueprintInputSnapshotHash } from "@/lib/blueprintWorkspace";
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

    const inputSnapshotHash = blueprintInputSnapshotHash(submission);
    const { data: existing, error: existingError } = await admin
      .from("stacks")
      .select("id")
      .eq("submission_id", submission.id)
      .eq("user_id", entitlement.user.id)
      .eq("input_snapshot_hash", inputSnapshotHash)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing?.id) {
      return NextResponse.json({ ok: true, stack_id: existing.id, reused: true });
    }

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
    console.error("[blueprints/refresh] failed", {
      submissionId,
      message: error instanceof Error ? error.message : String(error),
    });
    await recordProductEventSafely({
      user_id: entitlement.user.id,
      event_name: "blueprint_refresh_failed",
      source: "blueprints",
    });
    return NextResponse.json(
      { ok: false, error: "blueprint_refresh_failed" },
      { status: 500 }
    );
  }
}
