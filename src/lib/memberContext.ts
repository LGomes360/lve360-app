import type { CurrentBlueprintContext, ExperimentBlueprintContext } from "./blueprintContext";
import type { CurrentRegimenItem } from "./currentRegimenModel";
import type { SafetyFinding } from "./safetyEngine";

export const MEMBER_CONTEXT_VERSION = "member-intelligence-context-v1";

export type MemberContextStatus = "present" | "missing" | "stale";

export type MemberContextSource =
  | "users"
  | "user_preferences"
  | "submissions"
  | "goals"
  | "stacks"
  | "current_regimen_items"
  | "weekly_experiments"
  | "daily_practice_completions"
  | "weekly_experiment_reviews"
  | "logs"
  | "interactions"
  | "rules"
  | "intake"
  | "system";

export type MemberContextProvenance = {
  source: MemberContextSource;
  recordId: string | null;
  updatedAt: string | null;
};

export type MemberContextSection<T> = {
  status: MemberContextStatus;
  value: T;
  updatedAt: string | null;
  provenance: MemberContextProvenance[];
  missingReason: string | null;
};

export type MemberIdentityContext = {
  id: string;
  tier: string;
  joinedAt: string | null;
};

export type MemberHealthProfileContext = {
  age: number | null;
  sex: string | null;
  conditions: string[];
  allergies: string[];
  procedures: string[];
  pregnant: boolean | string | null;
  dosingPreference: string | null;
  brandPreference: string | null;
};

export type MemberPreferencesContext = {
  preferredName: string | null;
  weightUnit: "lb" | "kg";
  reminderPreference: "none" | "email";
  timezone: string;
  cueHour: number;
  quietStartHour: number;
  quietEndHour: number;
};

export type MemberGoalContext = {
  label: string;
  kind: "named" | "weight_target" | "sleep_target" | "energy_target";
  targetValue: number | null;
  provenance: MemberContextProvenance;
};

export type GoalSourceAlignment = {
  status: "aligned" | "different" | "single_source" | "missing";
  sharedLabels: string[];
  explanation: string;
};

export type MemberRegimenItemContext = Pick<
  CurrentRegimenItem,
  | "id"
  | "item_kind"
  | "name"
  | "purpose"
  | "dose"
  | "timing"
  | "schedule"
  | "instruction_source"
  | "instruction_authority"
  | "updated_at"
> & {
  provenance: MemberContextProvenance;
};

export type MemberRegimenContext = {
  medications: MemberContextSection<MemberRegimenItemContext[]>;
  hormones: MemberContextSection<MemberRegimenItemContext[]>;
  supplements: MemberContextSection<MemberRegimenItemContext[]>;
  endocrineActiveSupplements: MemberContextSection<MemberRegimenItemContext[]>;
};

export type PracticeGoalLink = {
  status: "linked" | "not_recorded";
  goalLabel: string | null;
  explanation: string;
};

export type PracticeBlueprintLink = {
  status: "current" | "historical" | "independent" | "unresolved";
  stackId: string | null;
  actionId: string | null;
  priorityLabel: string | null;
  explanation: string;
};

export type MemberPracticeContext = {
  id: string;
  identityDirection: string | null;
  actionLabel: string | null;
  cue: string | null;
  frequencyPerWeek: number | null;
  minimumVersion: string | null;
  weekStart: string;
  status: "draft" | "active" | "completed" | "archived";
  completionCount: number;
  fullCompletionCount: number;
  minimumCompletionCount: number;
  review: {
    difficulty: number | null;
    valueRating: number | null;
    decision: "keep" | "shrink" | "swap" | "pause" | "advance" | null;
    status: "draft" | "completed";
    completedAt: string | null;
  } | null;
  goalLink: PracticeGoalLink;
  blueprintLink: PracticeBlueprintLink;
  provenance: MemberContextProvenance[];
};

export type MemberCheckInContext = {
  date: string;
  weight: number | null;
  sleep: number | null;
  energy: number | null;
  provenance: MemberContextProvenance;
};

export type MemberSafetyItemContext = {
  code: string;
  item: string;
  message: string;
  severity: "info" | "warning" | "danger";
  decision: "review" | "blocked";
  sourceUrl: string | null;
  provenance: MemberContextProvenance;
};

export type MemberContextFreshness = {
  generatedAt: string;
  staleSections: string[];
  missingSections: string[];
  latestRecordedUpdate: string | null;
};

export type MemberIntelligenceContext = {
  version: typeof MEMBER_CONTEXT_VERSION;
  member: MemberContextSection<MemberIdentityContext | null>;
  healthProfile: MemberContextSection<MemberHealthProfileContext | null>;
  goals: {
    saved: MemberContextSection<MemberGoalContext[]>;
    blueprint: MemberContextSection<string[]>;
    alignment: GoalSourceAlignment;
  };
  blueprint: MemberContextSection<CurrentBlueprintContext | null>;
  regimen: MemberRegimenContext;
  activePractice: MemberContextSection<MemberPracticeContext | null>;
  recentPracticeHistory: MemberContextSection<MemberPracticeContext[]>;
  recentCheckIns: MemberContextSection<MemberCheckInContext[]>;
  preferences: MemberContextSection<MemberPreferencesContext | null>;
  unresolvedSafetyItems: MemberContextSection<MemberSafetyItemContext[]>;
  contextFreshness: MemberContextFreshness;
};

export type MemberContextExperimentInput = {
  id: string;
  source_stack_id: string | null;
  source_action_id: string | null;
  identity_direction: string | null;
  action_label: string | null;
  cue: string | null;
  frequency_per_week: number | null;
  minimum_version: string | null;
  status: "draft" | "active" | "completed" | "archived";
  week_start: string;
  created_at: string;
  updated_at: string;
};

export type MemberContextReviewInput = {
  id: string;
  experiment_id: string;
  difficulty: number | null;
  value_rating: number | null;
  decision: "keep" | "shrink" | "swap" | "pause" | "advance" | null;
  status: "draft" | "completed";
  completed_at: string | null;
  updated_at: string;
};

export type MemberContextCompletionInput = {
  id: string;
  experiment_id: string;
  completion_date: string;
  completion_kind: "full" | "minimum";
  updated_at: string;
};

export type MemberContextCheckInInput = {
  id: string;
  log_date: string;
  weight: number | null;
  sleep: number | null;
  energy: number | null;
  updated_at: string | null;
};

export type MemberIntelligenceContextInput = {
  generatedAt: string;
  member: (MemberIdentityContext & { updatedAt: string | null }) | null;
  healthProfile: (MemberHealthProfileContext & { submissionId: string; updatedAt: string | null }) | null;
  preferences: (MemberPreferencesContext & { updatedAt: string | null }) | null;
  savedGoals: MemberGoalContext[];
  goalsUpdatedAt: string | null;
  blueprint: CurrentBlueprintContext | null;
  regimen: CurrentRegimenItem[];
  experiments: MemberContextExperimentInput[];
  reviews: MemberContextReviewInput[];
  completions: MemberContextCompletionInput[];
  practiceBlueprintContexts: Record<string, ExperimentBlueprintContext>;
  checkIns: MemberContextCheckInInput[];
  safetyFindings: SafetyFinding[];
  safetyEvaluationComplete: boolean;
};

function section<T>(
  value: T,
  status: MemberContextStatus,
  updatedAt: string | null,
  provenance: MemberContextProvenance[],
  missingReason: string | null = null,
): MemberContextSection<T> {
  return { status, value, updatedAt, provenance, missingReason };
}

function validTimestamp(value: string | null | undefined): string | null {
  if (!value || Number.isNaN(Date.parse(value))) return null;
  return value;
}

function latestTimestamp(values: Array<string | null | undefined>): string | null {
  const valid = values.map(validTimestamp).filter((value): value is string => Boolean(value));
  return valid.sort((left, right) => Date.parse(right) - Date.parse(left))[0] ?? null;
}

function normalizedGoal(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function goalAlignment(saved: MemberGoalContext[], blueprint: string[]): GoalSourceAlignment {
  const savedLabels = new Map(saved.map((goal) => [normalizedGoal(goal.label), goal.label]));
  const blueprintLabels = new Map(blueprint.map((goal) => [normalizedGoal(goal), goal]));
  if (!savedLabels.size && !blueprintLabels.size) {
    return { status: "missing", sharedLabels: [], explanation: "No saved goals or Blueprint goals are currently recorded." };
  }
  if (!savedLabels.size || !blueprintLabels.size) {
    return { status: "single_source", sharedLabels: [], explanation: "Goals are currently recorded in only one source." };
  }
  const sharedLabels = [...savedLabels.keys()].filter((key) => blueprintLabels.has(key)).map((key) => savedLabels.get(key) as string);
  return sharedLabels.length
    ? { status: "aligned", sharedLabels, explanation: "At least one saved goal is also present in the current Blueprint." }
    : { status: "different", sharedLabels: [], explanation: "Saved goals and current Blueprint goals are both present but do not share an exact recorded label." };
}

function regimenSection(items: CurrentRegimenItem[], kind: CurrentRegimenItem["item_kind"], missingReason: string) {
  const selected = items.filter((item) => item.item_kind === kind).map((item): MemberRegimenItemContext => ({
    id: item.id,
    item_kind: item.item_kind,
    name: item.name,
    purpose: item.purpose,
    dose: item.dose,
    timing: item.timing,
    schedule: item.schedule,
    instruction_source: item.instruction_source,
    instruction_authority: item.instruction_authority,
    updated_at: item.updated_at,
    provenance: { source: "current_regimen_items", recordId: item.id, updatedAt: item.updated_at ?? null },
  }));
  return section(
    selected,
    selected.length ? "present" : "missing",
    latestTimestamp(selected.map((item) => item.updated_at)),
    selected.map((item) => item.provenance),
    selected.length ? null : missingReason,
  );
}

function practiceContext(
  experiment: MemberContextExperimentInput,
  reviews: MemberContextReviewInput[],
  completions: MemberContextCompletionInput[],
  blueprintContexts: Record<string, ExperimentBlueprintContext>,
): MemberPracticeContext {
  const review = reviews.find((item) => item.experiment_id === experiment.id) ?? null;
  const recorded = completions.filter((item) => item.experiment_id === experiment.id);
  const blueprint = blueprintContexts[experiment.id] ?? null;
  let blueprintLink: PracticeBlueprintLink;
  if (!experiment.source_stack_id && !experiment.source_action_id) {
    blueprintLink = {
      status: "independent",
      stackId: null,
      actionId: null,
      priorityLabel: null,
      explanation: "The member chose this practice independently of a Blueprint action.",
    };
  } else if (blueprint?.priority_label) {
    blueprintLink = {
      status: blueprint.is_current_blueprint ? "current" : "historical",
      stackId: blueprint.source_stack_id,
      actionId: blueprint.source_action_id,
      priorityLabel: blueprint.priority_label,
      explanation: blueprint.is_current_blueprint
        ? "This practice is linked to a priority in the current Blueprint."
        : "This practice is linked to a priority from an earlier Blueprint.",
    };
  } else {
    blueprintLink = {
      status: "unresolved",
      stackId: experiment.source_stack_id,
      actionId: experiment.source_action_id,
      priorityLabel: null,
      explanation: "A Blueprint reference is stored, but its priority could not be resolved.",
    };
  }

  const provenance: MemberContextProvenance[] = [
    { source: "weekly_experiments", recordId: experiment.id, updatedAt: experiment.updated_at },
    ...recorded.map((item) => ({ source: "daily_practice_completions" as const, recordId: item.id, updatedAt: item.updated_at })),
    ...(review ? [{ source: "weekly_experiment_reviews" as const, recordId: review.id, updatedAt: review.updated_at }] : []),
  ];
  return {
    id: experiment.id,
    identityDirection: experiment.identity_direction,
    actionLabel: experiment.action_label,
    cue: experiment.cue,
    frequencyPerWeek: experiment.frequency_per_week,
    minimumVersion: experiment.minimum_version,
    weekStart: experiment.week_start,
    status: experiment.status,
    completionCount: recorded.length,
    fullCompletionCount: recorded.filter((item) => item.completion_kind === "full").length,
    minimumCompletionCount: recorded.filter((item) => item.completion_kind === "minimum").length,
    review: review ? {
      difficulty: review.difficulty,
      valueRating: review.value_rating,
      decision: review.decision,
      status: review.status,
      completedAt: review.completed_at,
    } : null,
    goalLink: {
      status: "not_recorded",
      goalLabel: null,
      explanation: "The current schema does not store an explicit practice-to-saved-goal relation.",
    },
    blueprintLink,
    provenance,
  };
}

export function buildMemberIntelligenceContext(input: MemberIntelligenceContextInput): MemberIntelligenceContext {
  const member = input.member
    ? section<MemberIdentityContext>(
      { id: input.member.id, tier: input.member.tier, joinedAt: input.member.joinedAt },
      "present",
      input.member.updatedAt,
      [{ source: "users", recordId: input.member.id, updatedAt: input.member.updatedAt }],
    )
    : section<MemberIdentityContext | null>(null, "missing", null, [], "No member profile row was found.");
  const healthProfile = input.healthProfile
    ? section<MemberHealthProfileContext>(
      {
        age: input.healthProfile.age,
        sex: input.healthProfile.sex,
        conditions: input.healthProfile.conditions,
        allergies: input.healthProfile.allergies,
        procedures: input.healthProfile.procedures,
        pregnant: input.healthProfile.pregnant,
        dosingPreference: input.healthProfile.dosingPreference,
        brandPreference: input.healthProfile.brandPreference,
      },
      "present",
      input.healthProfile.updatedAt,
      [{ source: "submissions", recordId: input.healthProfile.submissionId, updatedAt: input.healthProfile.updatedAt }],
    )
    : section<MemberHealthProfileContext | null>(null, "missing", null, [], "No intake health profile is currently available.");
  const preferences = input.preferences
    ? section<MemberPreferencesContext>(
      {
        preferredName: input.preferences.preferredName,
        weightUnit: input.preferences.weightUnit,
        reminderPreference: input.preferences.reminderPreference,
        timezone: input.preferences.timezone,
        cueHour: input.preferences.cueHour,
        quietStartHour: input.preferences.quietStartHour,
        quietEndHour: input.preferences.quietEndHour,
      },
      "present",
      input.preferences.updatedAt,
      [{ source: "user_preferences", recordId: input.member?.id ?? null, updatedAt: input.preferences.updatedAt }],
    )
    : section<MemberPreferencesContext | null>(null, "missing", null, [], "No saved member preferences were found.");

  const blueprintGoals = input.blueprint?.goals ?? [];
  const savedGoals = section(
    input.savedGoals,
    input.savedGoals.length ? "present" : "missing",
    input.goalsUpdatedAt,
    input.savedGoals.map((goal) => goal.provenance),
    input.savedGoals.length ? null : "No explicit saved goals or targets were found.",
  );
  const blueprintGoalSection = section(
    blueprintGoals,
    blueprintGoals.length ? "present" : "missing",
    input.blueprint?.created_at ?? null,
    input.blueprint ? [{ source: "stacks", recordId: input.blueprint.stack_id, updatedAt: input.blueprint.created_at }] : [],
    blueprintGoals.length ? null : "The current Blueprint does not contain structured goal rows.",
  );
  const blueprint = input.blueprint
    ? section<CurrentBlueprintContext>(
      input.blueprint,
      input.blueprint.needs_refresh ? "stale" : "present",
      input.blueprint.created_at,
      [{ source: "stacks", recordId: input.blueprint.stack_id, updatedAt: input.blueprint.created_at }],
    )
    : section<CurrentBlueprintContext | null>(null, "missing", null, [], "No Blueprint is currently available.");

  const practices = [...input.experiments]
    .sort((left, right) => right.week_start.localeCompare(left.week_start) || right.updated_at.localeCompare(left.updated_at))
    .map((experiment) => practiceContext(experiment, input.reviews, input.completions, input.practiceBlueprintContexts));
  const active = practices.find((practice) => practice.status === "active") ?? null;
  const activePractice = active
    ? section<MemberPracticeContext>(active, "present", latestTimestamp(active.provenance.map((item) => item.updatedAt)), active.provenance)
    : section<MemberPracticeContext | null>(null, "missing", null, [], "No active weekly practice is currently recorded.");
  const history = practices.filter((practice) => practice.status !== "draft");
  const historyProvenance = history.flatMap((practice) => practice.provenance);
  const recentPracticeHistory = section(
    history,
    history.length ? "present" : "missing",
    latestTimestamp(historyProvenance.map((item) => item.updatedAt)),
    historyProvenance,
    history.length ? null : "No active or completed practice history is currently recorded.",
  );

  const checkIns = input.checkIns.map((item): MemberCheckInContext => ({
    date: item.log_date,
    weight: item.weight,
    sleep: item.sleep,
    energy: item.energy,
    provenance: { source: "logs", recordId: item.id, updatedAt: item.updated_at ?? item.log_date },
  }));
  const recentCheckIns = section(
    checkIns,
    checkIns.length ? "present" : "missing",
    latestTimestamp(checkIns.map((item) => item.provenance.updatedAt)),
    checkIns.map((item) => item.provenance),
    checkIns.length ? null : "No recent weight, sleep, or energy check-ins were found.",
  );
  const safetyItems = input.safetyFindings.map((finding): MemberSafetyItemContext => ({
    code: finding.code,
    item: finding.item,
    message: finding.message,
    severity: finding.severity,
    decision: finding.decision,
    sourceUrl: finding.sourceUrl ?? null,
    provenance: {
      source: finding.source,
      recordId: null,
      updatedAt: input.generatedAt,
    },
  }));
  const unresolvedSafetyItems = section(
    safetyItems,
    safetyItems.length || input.safetyEvaluationComplete ? "present" : "missing",
    input.safetyEvaluationComplete || safetyItems.length ? input.generatedAt : null,
    safetyItems.map((item) => item.provenance),
    safetyItems.length || input.safetyEvaluationComplete ? null : "The deterministic safety evaluation was unavailable.",
  );

  const regimen: MemberRegimenContext = {
    medications: regimenSection(input.regimen, "medication", "No active medications are currently recorded."),
    hormones: regimenSection(input.regimen, "hormone", "No active hormones are currently recorded."),
    supplements: regimenSection(input.regimen, "supplement", "No active supplements are currently recorded."),
    endocrineActiveSupplements: regimenSection(input.regimen, "endocrine_active_supplement", "No active endocrine-active supplements are currently recorded."),
  };
  const trackedSections: Record<string, MemberContextSection<unknown>> = {
    member,
    healthProfile,
    savedGoals,
    blueprintGoals: blueprintGoalSection,
    blueprint,
    medications: regimen.medications,
    hormones: regimen.hormones,
    supplements: regimen.supplements,
    endocrineActiveSupplements: regimen.endocrineActiveSupplements,
    activePractice,
    recentPracticeHistory,
    recentCheckIns,
    preferences,
    unresolvedSafetyItems,
  };
  const updates = Object.values(trackedSections).map((item) => item.updatedAt);

  return {
    version: MEMBER_CONTEXT_VERSION,
    member,
    healthProfile,
    goals: {
      saved: savedGoals,
      blueprint: blueprintGoalSection,
      alignment: goalAlignment(input.savedGoals, blueprintGoals),
    },
    blueprint,
    regimen,
    activePractice,
    recentPracticeHistory,
    recentCheckIns,
    preferences,
    unresolvedSafetyItems,
    contextFreshness: {
      generatedAt: input.generatedAt,
      staleSections: Object.entries(trackedSections).filter(([, value]) => value.status === "stale").map(([key]) => key),
      missingSections: Object.entries(trackedSections).filter(([, value]) => value.status === "missing").map(([key]) => key),
      latestRecordedUpdate: latestTimestamp(updates),
    },
  };
}
