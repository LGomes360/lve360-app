import "server-only";

import { applySafetyChecks } from "@/lib/safetyCheck";
import { getCurrentBlueprintContext, getExperimentBlueprintContexts } from "@/lib/currentBlueprintContext";
import { getCurrentRegimen } from "@/lib/currentRegimen";
import {
  buildMemberIntelligenceContext,
  type MemberContextCheckInInput,
  type MemberContextCompletionInput,
  type MemberContextExperimentInput,
  type MemberContextReviewInput,
  type MemberGoalContext,
  type MemberHealthProfileContext,
  type MemberIntelligenceContext,
  type MemberPreferencesContext,
} from "@/lib/memberContext";
import { practiceGoalOptions } from "@/lib/practiceConnection";
import type { SafetyContext } from "@/lib/safetyEngine";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

type MemberRow = {
  id: string;
  tier: string;
  created_at: string | null;
  updated_at: string | null;
};

type PreferencesRow = {
  preferred_name: string | null;
  weight_unit: string;
  reminder_preference: string;
  timezone: string;
  cue_hour: number;
  quiet_start_hour: number;
  quiet_end_hour: number;
  updated_at: string | null;
};

type SubmissionRow = {
  id: string;
  dob: string | null;
  sex: string | null;
  gender: string | null;
  conditions: string | null;
  allergies: string | null;
  pregnant: string | null;
  dosing_pref: string | null;
  brand_pref: string | null;
  engine_input_json: unknown;
  updated_at: string | null;
  created_at: string | null;
};

type GoalsRow = {
  id: string;
  goals: unknown;
  custom_goal: string | null;
  target_weight: number | string | null;
  target_sleep: number | string | null;
  target_energy: number | string | null;
  updated_at: string | null;
};

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function readableValues(value: unknown): string[] {
  if (value == null) return [];
  if (typeof value === "string" || typeof value === "number") {
    return String(value).split(/[,;|\n]/).map((item) => item.replace(/\s+/g, " ").trim())
      .filter((item) => item.length > 0 && !/^(?:none|no|n\/?a|not provided|unknown)$/i.test(item));
  }
  if (Array.isArray(value)) return [...new Set(value.flatMap(readableValues))];
  const source = objectValue(value);
  const named = source.name ?? source.label ?? source.text ?? source.value ?? source.answer
    ?? source.condition_name ?? source.allergy_name ?? source.med_name;
  if (named != null) return readableValues(named);
  return [...new Set(Object.values(source).flatMap(readableValues))];
}

function cleanText(value: unknown, max = 160): string | null {
  if (typeof value !== "string") return null;
  return value.replace(/\s+/g, " ").trim().slice(0, max) || null;
}

function calculateAge(dob: string | null, now: Date): number | null {
  if (!dob || !/^\d{4}-\d{2}-\d{2}$/.test(dob)) return null;
  const born = new Date(`${dob}T00:00:00Z`);
  if (Number.isNaN(born.getTime())) return null;
  let age = now.getUTCFullYear() - born.getUTCFullYear();
  const beforeBirthday = now.getUTCMonth() < born.getUTCMonth()
    || (now.getUTCMonth() === born.getUTCMonth() && now.getUTCDate() < born.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age >= 13 && age <= 120 ? age : null;
}

function numberOrNull(value: number | string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function healthProfile(row: SubmissionRow | null, now: Date): (MemberHealthProfileContext & { submissionId: string; updatedAt: string | null }) | null {
  if (!row) return null;
  const engine = objectValue(row.engine_input_json);
  const client = objectValue(engine.client ?? engine);
  return {
    submissionId: row.id,
    updatedAt: row.updated_at ?? row.created_at,
    age: calculateAge(row.dob, now),
    sex: cleanText(String(row.sex ?? row.gender ?? client.sex ?? client.gender ?? ""), 40),
    conditions: [...new Set(readableValues(client.conditions ?? row.conditions))].slice(0, 24),
    allergies: [...new Set(readableValues(client.allergies ?? row.allergies))].slice(0, 24),
    procedures: [...new Set(readableValues(client.procedures ?? client.upcoming_procedures ?? client.surgeries))].slice(0, 16),
    pregnant: typeof client.pregnant === "boolean" || typeof client.pregnant === "string" ? client.pregnant : row.pregnant,
    dosingPreference: cleanText(String(row.dosing_pref ?? client.dosing_pref ?? ""), 100),
    brandPreference: cleanText(String(row.brand_pref ?? client.brand_pref ?? ""), 100),
  };
}

function savedGoals(row: GoalsRow | null): MemberGoalContext[] {
  if (!row) return [];
  const provenance = { source: "goals" as const, recordId: row.id, updatedAt: row.updated_at };
  const values: Record<string, number | null> = {
    weight_target: numberOrNull(row.target_weight),
    sleep_target: numberOrNull(row.target_sleep),
    energy_target: numberOrNull(row.target_energy),
    named: null,
  };
  return practiceGoalOptions(row).map((goal): MemberGoalContext => ({
    key: goal.key,
    label: goal.label,
    kind: goal.kind,
    targetValue: values[goal.kind],
    provenance,
  }));
}

function preferences(row: PreferencesRow | null): (MemberPreferencesContext & { updatedAt: string | null }) | null {
  if (!row) return null;
  return {
    preferredName: cleanText(row.preferred_name, 80),
    weightUnit: row.weight_unit === "kg" ? "kg" : "lb",
    reminderPreference: row.reminder_preference === "email" ? "email" : "none",
    timezone: row.timezone || "UTC",
    cueHour: row.cue_hour,
    quietStartHour: row.quiet_start_hour,
    quietEndHour: row.quiet_end_hour,
    updatedAt: row.updated_at,
  };
}

export async function getMemberIntelligenceContext(userId: string): Promise<MemberIntelligenceContext> {
  const admin = getSupabaseAdmin();
  const now = new Date();
  const generatedAt = now.toISOString();
  const [
    memberResult,
    preferenceResult,
    submissionResult,
    goalsResult,
    blueprint,
    regimen,
    experimentResult,
    checkInResult,
  ] = await Promise.all([
    admin.from("users").select("id,tier,created_at,updated_at").eq("id", userId).maybeSingle(),
    admin.from("user_preferences")
      .select("preferred_name,weight_unit,reminder_preference,timezone,cue_hour,quiet_start_hour,quiet_end_hour,updated_at")
      .eq("user_id", userId).maybeSingle(),
    admin.from("submissions")
      .select("id,dob,sex,gender,conditions,allergies,pregnant,dosing_pref,brand_pref,engine_input_json,updated_at,created_at")
      .eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    admin.from("goals").select("id,goals,custom_goal,target_weight,target_sleep,target_energy,updated_at")
      .eq("user_id", userId).maybeSingle(),
    getCurrentBlueprintContext(userId),
    getCurrentRegimen(userId),
    admin.from("weekly_experiments")
      .select("id,source_stack_id,source_action_id,connection_type,goal_id,goal_key,goal_label_snapshot,identity_direction,action_label,cue,frequency_per_week,minimum_version,status,week_start,created_at,updated_at")
      .eq("user_id", userId).order("week_start", { ascending: false }).limit(12),
    admin.from("logs").select("id,log_date,weight,sleep,energy,updated_at")
      .eq("user_id", userId).order("log_date", { ascending: false }).limit(30),
  ]);
  for (const result of [memberResult, preferenceResult, submissionResult, goalsResult, experimentResult, checkInResult]) {
    if (result.error) throw result.error;
  }

  const experiments = (experimentResult.data ?? []) as MemberContextExperimentInput[];
  const experimentIds = experiments.map((item) => item.id);
  let reviews: MemberContextReviewInput[] = [];
  let completions: MemberContextCompletionInput[] = [];
  if (experimentIds.length) {
    const [reviewResult, completionResult] = await Promise.all([
      admin.from("weekly_experiment_reviews")
        .select("id,experiment_id,difficulty,value_rating,decision,status,completed_at,updated_at")
        .eq("user_id", userId).in("experiment_id", experimentIds),
      admin.from("daily_practice_completions")
        .select("id,experiment_id,completion_date,completion_kind,updated_at")
        .eq("user_id", userId).in("experiment_id", experimentIds),
    ]);
    if (reviewResult.error || completionResult.error) throw reviewResult.error ?? completionResult.error;
    reviews = (reviewResult.data ?? []) as MemberContextReviewInput[];
    completions = (completionResult.data ?? []) as MemberContextCompletionInput[];
  }

  const profile = healthProfile(submissionResult.data as SubmissionRow | null, now);
  const safetyContext: SafetyContext = {
    medications: regimen.filter((item) => item.item_kind === "medication").map((item) => item.name),
    conditions: profile?.conditions ?? [],
    allergies: profile?.allergies ?? [],
    procedures: profile?.procedures ?? [],
    pregnant: profile?.pregnant ?? null,
  };
  const currentSupplementCandidates = regimen
    .filter((item) => item.item_kind === "supplement" || item.item_kind === "endocrine_active_supplement")
    .map((item) => ({
      name: item.name,
      dose: item.dose,
      is_current: true,
      instruction_authority: item.instruction_authority,
    }));
  const [safety, practiceBlueprintContexts] = await Promise.all([
    currentSupplementCandidates.length
      ? applySafetyChecks(safetyContext, currentSupplementCandidates)
      : Promise.resolve({ complete: true, findings: [] }),
    getExperimentBlueprintContexts(userId, experiments, blueprint),
  ]);
  const memberRow = memberResult.data as MemberRow | null;
  const goalsRow = goalsResult.data as GoalsRow | null;

  return buildMemberIntelligenceContext({
    generatedAt,
    member: memberRow ? {
      id: memberRow.id,
      tier: memberRow.tier,
      joinedAt: memberRow.created_at,
      updatedAt: memberRow.updated_at ?? memberRow.created_at,
    } : null,
    healthProfile: profile,
    preferences: preferences(preferenceResult.data as PreferencesRow | null),
    savedGoals: savedGoals(goalsRow),
    goalsUpdatedAt: goalsRow?.updated_at ?? null,
    blueprint,
    regimen,
    experiments,
    reviews,
    completions,
    practiceBlueprintContexts,
    checkIns: (checkInResult.data ?? []) as MemberContextCheckInInput[],
    safetyFindings: safety.findings,
    safetyEvaluationComplete: safety.complete,
  });
}
