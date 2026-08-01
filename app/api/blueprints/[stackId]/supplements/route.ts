import { NextResponse } from "next/server";

import {
  blueprintInputSnapshotHash,
  normalizeMemberSupplements,
  withMemberSupplementOverride,
} from "@/lib/blueprintWorkspace";
import { recordProductEventSafely } from "@/lib/productAnalytics";
import { replaceCurrentSupplements } from "@/lib/currentRegimen";
import { regimenToLedger } from "@/lib/currentRegimenModel";
import { requirePaidApi } from "@/lib/serverEntitlements";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type RouteContext = { params: Promise<{ stackId: string }> };

export async function PUT(req: Request, { params }: RouteContext) {
  const entitlement = await requirePaidApi();
  if (!entitlement.ok) return entitlement.response;

  try {
    const { stackId } = await params;
    const body = await req.json().catch(() => null) as { supplements?: unknown } | null;
    const supplements = normalizeMemberSupplements(body?.supplements);
    const admin = getSupabaseAdmin();

    const { data: stack, error: stackError } = await admin
      .from("stacks")
      .select("*")
      .eq("id", stackId)
      .eq("user_id", entitlement.user.id)
      .maybeSingle();
    if (stackError) throw stackError;
    if (!stack?.submission_id) {
      return NextResponse.json({ ok: false, error: "blueprint_not_found" }, { status: 404 });
    }
    if (!Object.prototype.hasOwnProperty.call(stack, "input_snapshot_hash")) {
      return NextResponse.json({ ok: false, error: "blueprint_versioning_unavailable" }, { status: 503 });
    }

    const { data: submission, error: submissionError } = await admin
      .from("submissions")
      .select("id, user_id, engine_input_json, answers, payload_json")
      .eq("id", stack.submission_id)
      .eq("user_id", entitlement.user.id)
      .maybeSingle();
    if (submissionError) throw submissionError;
    if (!submission) {
      return NextResponse.json({ ok: false, error: "blueprint_not_found" }, { status: 404 });
    }

    const engineInput = withMemberSupplementOverride(submission, supplements);
    const { data: updated, error: updateError } = await admin
      .from("submissions")
      .update({ engine_input_json: engineInput, updated_at: new Date().toISOString() })
      .eq("id", submission.id)
      .eq("user_id", entitlement.user.id)
      .select("id, engine_input_json, answers, payload_json")
      .maybeSingle();
    if (updateError) throw updateError;
    if (!updated) {
      return NextResponse.json({ ok: false, error: "update_not_saved" }, { status: 409 });
    }

    const currentRegimen = await replaceCurrentSupplements(entitlement.user.id, submission.id, supplements);

    const currentInputHash = blueprintInputSnapshotHash(updated, regimenToLedger(currentRegimen));
    await recordProductEventSafely({
      user_id: entitlement.user.id,
      event_name: "blueprint_input_change_saved",
      source: "blueprints",
    });

    return NextResponse.json({
      ok: true,
      supplements,
      stale: !stack.input_snapshot_hash || stack.input_snapshot_hash !== currentInputHash,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "supplement_update_failed";
    const status = [
      "supplements_must_be_an_array",
      "too_many_supplements",
      "invalid_supplement",
      "invalid_supplement_name",
      "duplicate_supplement",
    ].includes(message) ? 400 : 500;
    if (status === 500) console.error("[blueprints/supplements] failed", error);
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
