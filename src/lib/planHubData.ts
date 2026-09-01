import "server-only";

import { getCurrentBlueprintContext } from "@/lib/currentBlueprintContext";
import { getCurrentRegimen } from "@/lib/currentRegimen";
import type { BlueprintSafetyStatus } from "@/lib/blueprintSafetyStatus";
import { buildPlanRegimenGroups, buildPlanScheduleCoverage } from "@/lib/planHub";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export type PlanFocus = {
  label: string;
  identityDirection: string | null;
  cue: string | null;
  frequencyPerWeek: number | null;
  source: "practice" | "blueprint";
};

export type PlanPractice = {
  id: string;
  identityDirection: string;
  actionLabel: string;
  cue: string;
  frequencyPerWeek: number;
  minimumVersion: string;
  updatedAt: string;
};

export type PlanChange = {
  id: string;
  domain: "regimen" | "practice";
  changeType: string;
  source: string;
  summary: string;
  createdAt: string;
};

export type PlanHubData = {
  focus: PlanFocus | null;
  practices: PlanPractice[];
  regimenGroups: ReturnType<typeof buildPlanRegimenGroups>;
  scheduleCoverage: ReturnType<typeof buildPlanScheduleCoverage>;
  regimenCount: number;
  safety: {
    stackId: string | null;
    status: BlueprintSafetyStatus | null;
    acknowledged: boolean;
    needsRefresh: boolean;
  };
  recentChanges: PlanChange[];
};

type PracticeRow = {
  id: string;
  identity_direction: string;
  action_label: string;
  cue: string;
  frequency_per_week: number;
  minimum_version: string;
  updated_at: string;
};

type ExperimentRow = {
  action_label: string | null;
  identity_direction: string | null;
  cue: string | null;
  frequency_per_week: number | null;
};

type ChangeRow = {
  id: string;
  domain: "regimen" | "practice";
  change_type: string;
  source: string;
  change_summary: string;
  created_at: string;
};

export async function getPlanHubData(userId: string): Promise<PlanHubData> {
  const admin = getSupabaseAdmin();
  const [blueprint, regimen, practicesResult, experimentResult, changesResult] = await Promise.all([
    getCurrentBlueprintContext(userId),
    getCurrentRegimen(userId),
    admin
      .from("practices")
      .select("id,identity_direction,action_label,cue,frequency_per_week,minimum_version,updated_at")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("updated_at", { ascending: false }),
    admin
      .from("weekly_experiments")
      .select("action_label,identity_direction,cue,frequency_per_week")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from("plan_change_events")
      .select("id,domain,change_type,source,change_summary,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(6),
  ]);

  for (const result of [practicesResult, experimentResult, changesResult]) {
    if (result.error) throw result.error;
  }

  const experiment = experimentResult.data as ExperimentRow | null;
  const blueprintPriority = blueprint?.priorities[0] ?? null;
  const focus: PlanFocus | null = experiment?.action_label
    ? {
        label: experiment.action_label,
        identityDirection: experiment.identity_direction,
        cue: experiment.cue,
        frequencyPerWeek: experiment.frequency_per_week,
        source: "practice",
      }
    : blueprintPriority
      ? {
          label: blueprintPriority.label,
          identityDirection: blueprintPriority.category,
          cue: null,
          frequencyPerWeek: null,
          source: "blueprint",
        }
      : null;

  return {
    focus,
    practices: ((practicesResult.data ?? []) as PracticeRow[]).map((practice) => ({
      id: practice.id,
      identityDirection: practice.identity_direction,
      actionLabel: practice.action_label,
      cue: practice.cue,
      frequencyPerWeek: practice.frequency_per_week,
      minimumVersion: practice.minimum_version,
      updatedAt: practice.updated_at,
    })),
    regimenGroups: buildPlanRegimenGroups(regimen),
    scheduleCoverage: buildPlanScheduleCoverage(regimen),
    regimenCount: regimen.length,
    safety: {
      stackId: blueprint?.stack_id ?? null,
      status: blueprint?.safety_status ?? null,
      acknowledged: blueprint?.safety_acknowledged ?? false,
      needsRefresh: blueprint?.needs_refresh ?? false,
    },
    recentChanges: ((changesResult.data ?? []) as ChangeRow[]).map((change) => ({
      id: change.id,
      domain: change.domain,
      changeType: change.change_type,
      source: change.source,
      summary: change.change_summary,
      createdAt: change.created_at,
    })),
  };
}
