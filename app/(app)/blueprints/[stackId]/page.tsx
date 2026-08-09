import { notFound } from "next/navigation";

import { requireTier } from "@/app/_auth/requireTier";
import { buildBlueprintActionCandidates } from "@/lib/blueprintActions";
import { parseBlueprintReport } from "@/lib/blueprintReport";
import {
  blueprintMarkdownFromStack,
  deriveBlueprintSafetyStatus,
} from "@/lib/blueprintSafetyStatus";
import {
  blueprintInputSnapshotHash,
} from "@/lib/blueprintWorkspace";
import { ensureCurrentRegimen, getCurrentRegimen } from "@/lib/currentRegimen";
import { regimenToLedger } from "@/lib/currentRegimenModel";
import { canonicalRegimenTiming } from "@/lib/regimenSchedule";
import { extractBlueprintGoalNames } from "@/lib/recommendationDecision";
import { getStackRecommendationDecisions } from "@/lib/recommendationDecisionData";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

import BlueprintWorkspaceClient from "./BlueprintWorkspaceClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = { params: Promise<{ stackId: string }> };

export default async function BlueprintPage({ params }: PageProps) {
  const { stackId } = await params;
  const { user } = await requireTier(["premium", "trial"], {
    next: `/blueprints/${stackId}`,
  });
  const admin = getSupabaseAdmin();

  const { data: stack, error: stackError } = await admin
    .from("stacks")
    .select("*")
    .eq("id", stackId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (stackError) throw stackError;
  if (!stack?.submission_id) notFound();

  const [{ data: submission, error: submissionError }, { data: history, error: historyError }] = await Promise.all([
    admin
      .from("submissions")
      .select("id, user_id, engine_input_json, answers, payload_json")
      .eq("id", stack.submission_id)
      .eq("user_id", user.id)
      .maybeSingle(),
    admin
      .from("stacks")
      .select("*")
      .eq("submission_id", stack.submission_id)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
  ]);
  if (submissionError) throw submissionError;
  if (historyError) throw historyError;
  if (!submission) notFound();

  const markdown = blueprintMarkdownFromStack(stack);
  const report = parseBlueprintReport(markdown);
  await ensureCurrentRegimen(user.id, submission.id, submission);
  const regimen = await getCurrentRegimen(user.id);
  const recommendations = await getStackRecommendationDecisions(
    user.id,
    stack.id,
    regimen,
    extractBlueprintGoalNames(report.sections.Goals),
    report.canonicalMarkdown,
  );
  const supplementRegimen = regimen.filter((item) =>
    item.item_kind === "supplement" || item.item_kind === "endocrine_active_supplement"
  );
  const supplements = supplementRegimen.map((item) => ({
    id: item.id,
    name: item.name,
    brand: item.brand,
    dose: item.dose,
    timing: canonicalRegimenTiming(item),
    active: item.active,
  }));
  const hasOverride = supplementRegimen.some((item) => item.instruction_source !== "intake");
  const currentInputHash = blueprintInputSnapshotHash(submission, regimenToLedger(regimen));
  const versioningReady = Object.prototype.hasOwnProperty.call(stack, "input_snapshot_hash");
  const stale = versioningReady
    ? !stack.input_snapshot_hash || stack.input_snapshot_hash !== currentInputHash
    : false;
  const latestId = history?.[0]?.id ?? stack.id;

  return (
    <BlueprintWorkspaceClient
      stack={{
        id: stack.id,
        submissionId: stack.submission_id,
        createdAt: stack.created_at,
        safetyStatus: deriveBlueprintSafetyStatus(markdown),
        generationReason: stack.generation_reason,
        safetyAcknowledgedAt: stack.safety_acknowledged_at ?? null,
      }}
      sections={Object.entries(report.sections)
        .filter(([, body]) => Boolean(body.trim()))
        .map(([name, body]) => ({ name, body }))}
      actions={buildBlueprintActionCandidates(report)}
      recommendations={recommendations}
      initialSupplements={supplements}
      hasMemberOverride={hasOverride}
      initialStale={stale}
      versioningReady={versioningReady}
      isLatest={latestId === stack.id}
      history={(history ?? []).map((version) => ({
        id: version.id,
        createdAt: version.created_at,
        safetyStatus: deriveBlueprintSafetyStatus(blueprintMarkdownFromStack(version)),
        generationReason: version.generation_reason,
      }))}
    />
  );
}
