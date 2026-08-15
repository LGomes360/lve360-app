import "server-only";

import type { WeeklyExperiment } from "@/lib/activation";
import { buildBlueprintActionCandidates } from "@/lib/blueprintActions";
import type {
  CurrentBlueprintContext,
  ExperimentBlueprintContext,
} from "@/lib/blueprintContext";
import { parseBlueprintReport } from "@/lib/blueprintReport";
import {
  blueprintMarkdownFromStack,
  deriveBlueprintSafetyStatus,
} from "@/lib/blueprintSafetyStatus";
import { blueprintInputSnapshotHash } from "@/lib/blueprintWorkspace";
import { ensureCurrentRegimen, getCurrentRegimen } from "@/lib/currentRegimen";
import { regimenToLedger } from "@/lib/currentRegimenModel";
import { extractBlueprintGoalNames, isActionableRecommendationStatus } from "@/lib/recommendationDecision";
import { getStackRecommendationDecisions } from "@/lib/recommendationDecisionData";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

type StackSource = {
  id: string;
  submission_id: string | null;
  sections: unknown;
  summary: string | null;
  created_at: string;
  input_snapshot_hash: string | null;
  safety_acknowledged_at: string | null;
};

function stackActions(stack: Pick<StackSource, "sections" | "summary">) {
  const report = parseBlueprintReport(blueprintMarkdownFromStack(stack));
  return buildBlueprintActionCandidates(report);
}

export async function getCurrentBlueprintContext(userId: string): Promise<CurrentBlueprintContext | null> {
  const admin = getSupabaseAdmin();
  const { data: latest, error } = await admin
    .from("stacks")
    .select("id,submission_id,sections,summary,created_at,input_snapshot_hash,safety_acknowledged_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!latest) return null;

  const stack = latest as StackSource;
  const markdown = blueprintMarkdownFromStack(stack);
  const report = parseBlueprintReport(markdown);
  let needsRefresh = false;
  let regimen: Awaited<ReturnType<typeof getCurrentRegimen>> | null = null;
  if (stack.submission_id) {
    const { data: submission, error: submissionError } = await admin
      .from("submissions")
      .select("id,user_id,engine_input_json,answers,payload_json")
      .eq("id", stack.submission_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (submissionError) throw submissionError;
    if (submission) {
      await ensureCurrentRegimen(userId, submission.id, submission);
      regimen = await getCurrentRegimen(userId);
      const currentHash = blueprintInputSnapshotHash(submission, regimenToLedger(regimen));
      needsRefresh = !stack.input_snapshot_hash || stack.input_snapshot_hash !== currentHash;
    }
  }
  regimen ??= await getCurrentRegimen(userId);
  const recommendations = await getStackRecommendationDecisions(
    userId,
    stack.id,
    regimen,
    extractBlueprintGoalNames(report.sections.Goals),
    report.canonicalMarkdown,
  );

  return {
    stack_id: stack.id,
    created_at: stack.created_at,
    goals: extractBlueprintGoalNames(report.sections.Goals),
    safety_status: deriveBlueprintSafetyStatus(markdown),
    safety_acknowledged: Boolean(stack.safety_acknowledged_at),
    needs_refresh: needsRefresh,
    actionable_recommendation_count: recommendations.filter(({ decision }) =>
      isActionableRecommendationStatus(decision.status)
    ).length,
    priorities: stackActions(stack).map(({ id, label, category, kind }) => ({ id, label, category, kind })),
  };
}

export async function getExperimentBlueprintContexts(
  userId: string,
  experiments: Array<Pick<WeeklyExperiment, "id" | "source_stack_id" | "source_action_id" | "status">>,
  current: CurrentBlueprintContext | null,
): Promise<Record<string, ExperimentBlueprintContext>> {
  const sourceIds = [...new Set(experiments.map((item) => item.source_stack_id).filter((id): id is string => Boolean(id)))];
  const stackMap = new Map<string, StackSource>();
  if (sourceIds.length) {
    const { data, error } = await getSupabaseAdmin()
      .from("stacks")
      .select("id,submission_id,sections,summary,created_at,input_snapshot_hash,safety_acknowledged_at")
      .eq("user_id", userId)
      .in("id", sourceIds);
    if (error) throw error;
    for (const stack of (data ?? []) as StackSource[]) stackMap.set(stack.id, stack);
  }

  return Object.fromEntries(experiments.map((experiment) => {
    const stack = experiment.source_stack_id ? stackMap.get(experiment.source_stack_id) ?? null : null;
    const priority = stack && experiment.source_action_id
      ? stackActions(stack).find((action) => action.id === experiment.source_action_id) ?? null
      : null;
    const isCurrentBlueprint = Boolean(current && stack && stack.id === current.stack_id);
    return [experiment.id, {
      source_stack_id: experiment.source_stack_id,
      source_action_id: experiment.source_action_id,
      priority_label: priority?.label ?? null,
      priority_category: priority?.category ?? null,
      priority_kind: priority?.kind ?? null,
      blueprint_created_at: stack?.created_at ?? null,
      is_current_blueprint: isCurrentBlueprint,
      needs_review: experiment.status === "active" && Boolean(stack) && !isCurrentBlueprint,
    }];
  }));
}
