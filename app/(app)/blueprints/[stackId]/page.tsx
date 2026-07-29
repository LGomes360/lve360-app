import { notFound } from "next/navigation";

import { requireTier } from "@/app/_auth/requireTier";
import { buildBlueprintActionCandidates } from "@/lib/blueprintActions";
import { parseBlueprintReport } from "@/lib/blueprintReport";
import {
  blueprintInputSnapshotHash,
  getMemberSupplements,
} from "@/lib/blueprintWorkspace";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

import BlueprintWorkspaceClient from "./BlueprintWorkspaceClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = { params: { stackId: string } };

function markdownFromStack(stack: { sections: unknown; summary: string | null }): string {
  if (stack.sections && typeof stack.sections === "object" && "markdown" in stack.sections) {
    const markdown = (stack.sections as { markdown?: unknown }).markdown;
    if (typeof markdown === "string") return markdown;
  }
  return stack.summary ?? "";
}

export default async function BlueprintPage({ params }: PageProps) {
  const { user } = await requireTier(["premium", "trial"], {
    next: `/blueprints/${params.stackId}`,
  });
  const admin = getSupabaseAdmin();

  const { data: stack, error: stackError } = await admin
    .from("stacks")
    .select("*")
    .eq("id", params.stackId)
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

  const markdown = markdownFromStack(stack);
  const report = parseBlueprintReport(markdown);
  const { supplements, hasOverride } = getMemberSupplements(submission);
  const currentInputHash = blueprintInputSnapshotHash(submission);
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
        safetyStatus: stack.safety_status,
        generationReason: stack.generation_reason,
      }}
      sections={Object.entries(report.sections)
        .filter(([, body]) => Boolean(body.trim()))
        .map(([name, body]) => ({ name, body }))}
      actions={buildBlueprintActionCandidates(report)}
      initialSupplements={supplements}
      hasMemberOverride={hasOverride}
      initialStale={stale}
      versioningReady={versioningReady}
      isLatest={latestId === stack.id}
      history={(history ?? []).map((version) => ({
        id: version.id,
        createdAt: version.created_at,
        safetyStatus: version.safety_status,
        generationReason: version.generation_reason,
      }))}
    />
  );
}
