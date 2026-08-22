import "server-only";

import { generateAI } from "@/lib/ai/gateway";
import { evidenceOptionByName, retrieveCoachEvidence, type CoachEvidenceOption } from "@/lib/coachEvidence";
import { deterministicCoachTask } from "@/lib/coachIntent";
import {
  buildSafeNextWeekMovementFallback,
  parseStructuredCoachAnswer,
  type CoachConstraints,
  type CoachIntent,
  type CoachPage,
  type CoachRegimenKind,
  type CoachRoutingDecision,
  type CoachSource,
  type StructuredCoachAnswer,
} from "@/lib/contextualCoach";
import {
  validateCoachTaskSuccess,
  type CoachTaskSuccessReport,
  type CoachTaskValidatorId,
} from "@/lib/coachTaskValidation";
import { healthItemIdentityKey } from "@/lib/healthItemIdentity";
import type { MemberIntelligenceContext, MemberRegimenItemContext } from "@/lib/memberContext";
import { getMemberIntelligenceContext } from "@/lib/memberContextData";
import { applySafetyChecks, type AppliedSafetyResult } from "@/lib/safetyCheck";
import type { SafetyContext } from "@/lib/safetyEngine";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export type CoachContext = {
  page: CoachPage;
  intent: CoachIntent;
  constraints: CoachConstraints;
  requestedRegimenKinds: CoachRegimenKind[];
  memberContext: MemberIntelligenceContext;
  sources: CoachSource[];
  facts: Record<string, unknown>;
  evidenceOptions: CoachEvidenceOption[];
  safetyContext: SafetyContext;
  preSafety: AppliedSafetyResult | null;
  namedSafetyCandidateKeys: string[];
};

export type CoachDiagnostics = {
  intent: CoachIntent;
  constraints: CoachConstraints;
  qualityScore: number;
  safetyRuleCount: number;
  recommendationsRemoved: number;
  regenerationCount: number;
  evidenceIds: string[];
  taskPassed: boolean;
  taskCompleteness: number;
  factualCoverage: number;
  failedValidators: CoachTaskValidatorId[];
  missingRequirementCount: number;
  constraintViolationCount: number;
  repairReason: "parse_failed" | "task_validation_failed" | null;
  fallbackReason: "model_unavailable" | "repair_failed" | "deterministic_validation_failed" | null;
};

const INTENT_SOURCE_IDS: Record<CoachIntent, string[]> = {
  GENERAL_EDUCATION: ["evidence", "current_routine", "health_profile", "recent_coaching"],
  PERSONALIZED_RECOMMENDATION: ["evidence", "current_routine", "health_profile", "goals", "recent_check_ins", "current_blueprint", "recent_coaching"],
  CURRENT_REGIMEN_LOOKUP: ["current_routine"],
  MEDICATION_LOOKUP: ["current_routine"],
  HORMONE_LOOKUP: ["current_routine"],
  SUPPLEMENT_LOOKUP: ["current_routine"],
  CURRENT_PLAN_LOOKUP: ["current_routine"],
  SAFETY_REVIEW: ["safety_review", "current_routine", "health_profile"],
  BEHAVIORAL_COACHING: ["weekly_practice", "recent_check_ins", "goals", "preferences", "recent_coaching"],
  PRIORITIZATION: ["weekly_practice", "recent_check_ins", "goals", "current_blueprint"],
  MISSING_CONTEXT: ["context_status", "current_routine", "goals", "health_profile", "weekly_practice", "recent_check_ins", "preferences"],
  EVIDENCE_COMPARISON: ["evidence", "current_routine", "health_profile", "goals", "recent_coaching"],
  OUT_OF_SCOPE: [],
  OPTION_COMPARISON: ["evidence", "current_routine", "health_profile", "goals", "recent_check_ins", "recent_coaching"],
  PLAN_EXPLANATION: ["current_blueprint", "current_routine", "goals", "recent_coaching"],
  TIMING_OR_DOSING: ["evidence", "current_routine", "health_profile", "recent_coaching"],
  PROGRESS_COACHING: ["weekly_practice", "recent_check_ins", "goals", "current_blueprint", "recent_coaching"],
  REQUEST_TO_CHANGE_RECORD: ["current_routine", "evidence", "health_profile"],
  POTENTIAL_MEDICAL_RED_FLAG: [],
};

function compact(value: string | null | undefined, length = 160) {
  return value?.replace(/\s+/g, " ").trim().slice(0, length) || null;
}

function regimenItems(context: MemberIntelligenceContext): MemberRegimenItemContext[] {
  return [
    ...context.regimen.medications.value,
    ...context.regimen.hormones.value,
    ...context.regimen.supplements.value,
    ...context.regimen.endocrineActiveSupplements.value,
  ];
}

function supplementItems(context: MemberIntelligenceContext) {
  return [...context.regimen.supplements.value, ...context.regimen.endocrineActiveSupplements.value];
}

function searchableText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

const GENERIC_REGIMEN_WORDS = new Set(["vitamin", "magnesium", "omega", "supplement", "medication", "hormone"]);

function questionNamesRegimenItem(question: string, name: string) {
  const query = searchableText(question);
  const item = searchableText(name);
  const identity = healthItemIdentityKey(name).replace(/-/g, " ");
  const firstWord = item.split(" ")[0];
  return Boolean(item && query.includes(item))
    || Boolean(identity && query.includes(identity))
    || Boolean(firstWord.length >= 5 && !GENERIC_REGIMEN_WORDS.has(firstWord) && query.includes(firstWord));
}

function namedCurrentSupplements(question: string, context: MemberIntelligenceContext) {
  return supplementItems(context).filter((item) => questionNamesRegimenItem(question, item.name));
}

function isSafetySensitiveQuestion(question: string) {
  return /\b(?:safe|safety|interact|interaction|contraindicat|conflict|warning|separat|spacing|thyroid|levothyroxine|upper[- ]?intake|upper limit|threshold|review)\b/i.test(question);
}

function explicitlyNamedEvidenceOption(question: string, options: CoachEvidenceOption[]) {
  const normalizedQuestion = question.toLowerCase();
  return options.find((option) => {
    const normalizedName = option.name.toLowerCase();
    const firstWord = normalizedName.split(/\s+/)[0];
    return normalizedQuestion.includes(normalizedName)
      || (firstWord.length >= 4 && normalizedQuestion.includes(firstWord));
  }) ?? null;
}

export async function buildCoachContext(
  userId: string,
  page: CoachPage,
  question: string,
  routing: CoachRoutingDecision,
): Promise<CoachContext> {
  const requested = new Set(INTENT_SOURCE_IDS[routing.intent]);
  const needsEvidence = requested.has("evidence");
  const needsRecentCoaching = requested.has("recent_coaching");
  const admin = getSupabaseAdmin();
  const [memberContext, recentTurnsResult] = await Promise.all([
    getMemberIntelligenceContext(userId),
    needsRecentCoaching
      ? admin.from("ai_coaching_turns")
        .select("question,answer,created_at").eq("user_id", userId).neq("generation_status", "pending")
        .order("created_at", { ascending: false }).limit(3)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (recentTurnsResult.error) throw recentTurnsResult.error;

  const allRegimen = regimenItems(memberContext);
  const sources: CoachSource[] = [];
  const facts: Record<string, unknown> = {};

  if (requested.has("current_blueprint")) {
    const blueprint = memberContext.blueprint.value;
    sources.push({
      id: "current_blueprint",
      label: "Current Blueprint",
      summary: blueprint
        ? `${blueprint.priorities.length} priorities; ${memberContext.blueprint.status === "stale" ? "saved changes await review" : "current with saved information"}.`
        : "No current Blueprint is recorded.",
      href: blueprint ? `/blueprints/${blueprint.stack_id}` : "/blueprints",
    });
    facts.blueprint = blueprint ? {
      generated_at: blueprint.created_at,
      safety_status: blueprint.safety_status,
      safety_acknowledged: blueprint.safety_acknowledged,
      needs_refresh: blueprint.needs_refresh,
      priorities: blueprint.priorities.slice(0, 8).map((item) => ({ label: compact(item.label), category: item.category, kind: item.kind })),
    } : null;
  }

  if (requested.has("current_routine")) {
    sources.push({
      id: "current_routine",
      label: "Current Routine",
      summary: `${allRegimen.length} active medication, hormone, and supplement records.`,
      href: "/routine",
    });
    facts.routine = allRegimen.map((item) => ({
      id: item.id,
      kind: item.item_kind,
      name: item.name,
      purpose: item.purpose,
      dose: item.dose,
      timing: item.timing,
      schedule: item.schedule,
      instruction_source: item.instruction_source,
      instruction_authority: item.instruction_authority,
      updated_at: item.updated_at,
    }));
  }

  if (requested.has("weekly_practice")) {
    const practice = memberContext.activePractice.value;
    sources.push({
      id: "weekly_practice",
      label: "Weekly Practice",
      summary: practice
        ? `${practice.completionCount} completions recorded toward this week's ${practice.frequencyPerWeek ?? 0}-day target.`
        : "No active weekly practice is recorded.",
      href: "/today",
    });
    facts.weekly_practice = practice ? {
      identity: practice.identityDirection,
      action: practice.actionLabel,
      cue: practice.cue,
      minimum_version: practice.minimumVersion,
      target: practice.frequencyPerWeek,
      completions: practice.completionCount,
      week_start: practice.weekStart,
      blueprint_link: practice.blueprintLink,
      goal_link: practice.goalLink,
    } : null;
  }

  if (requested.has("recent_check_ins")) {
    const checkIns = memberContext.recentCheckIns.value;
    sources.push({
      id: "recent_check_ins",
      label: "Recent check-ins",
      summary: `${checkIns.length} recent weight, sleep, or energy entries.`,
      href: "/journey",
    });
    facts.recent_check_ins = checkIns.map((item) => ({
      date: item.date,
      weight: item.weight,
      sleep_rating_out_of_5: item.sleep,
      energy_rating_out_of_10: item.energy,
    }));
  }

  if (requested.has("goals")) {
    const saved = memberContext.goals.saved.value;
    const blueprintGoals = memberContext.goals.blueprint.value;
    sources.push({
      id: "goals",
      label: "Goals",
      summary: `${saved.length} saved goals and ${blueprintGoals.length} Blueprint goals.`,
      href: "/settings",
    });
    facts.goals = {
      saved: saved.map((goal) => ({ label: goal.label, kind: goal.kind, target_value: goal.targetValue })),
      blueprint: blueprintGoals,
      alignment: memberContext.goals.alignment,
    };
  }

  if (requested.has("health_profile")) {
    sources.push({
      id: "health_profile",
      label: "Health profile",
      summary: memberContext.healthProfile.status === "present"
        ? "Saved age/life-stage, conditions, allergies, procedures, and preferences used only when relevant."
        : "No intake health profile is currently available.",
      href: "/settings",
    });
    facts.health_profile = memberContext.healthProfile.value;
  }

  if (requested.has("preferences")) {
    sources.push({
      id: "preferences",
      label: "Preferences",
      summary: memberContext.preferences.status === "present"
        ? "Saved timezone, reminder, quiet-hour, and unit preferences."
        : "No member preferences are currently recorded.",
      href: "/settings",
    });
    facts.preferences = memberContext.preferences.value;
  }

  if (requested.has("safety_review")) {
    const safetyItems = memberContext.unresolvedSafetyItems.value;
    sources.push({
      id: "safety_review",
      label: "Deterministic safety review",
      summary: memberContext.unresolvedSafetyItems.status === "missing"
        ? "The current safety evaluation was unavailable."
        : `${safetyItems.length} unresolved finding${safetyItems.length === 1 ? "" : "s"} from the current Routine.`,
      href: "/blueprints",
    });
    facts.safety_items = safetyItems;
  }

  if (requested.has("context_status")) {
    sources.push({
      id: "context_status",
      label: "Member context status",
      summary: `${memberContext.contextFreshness.missingSections.length} missing and ${memberContext.contextFreshness.staleSections.length} stale context sections.`,
      href: "/settings",
    });
    facts.context_status = {
      missing_sections: memberContext.contextFreshness.missingSections,
      stale_sections: memberContext.contextFreshness.staleSections,
      generated_at: memberContext.contextFreshness.generatedAt,
      latest_recorded_update: memberContext.contextFreshness.latestRecordedUpdate,
    };
  }

  const recentTurns = recentTurnsResult.data ?? [];
  if (needsRecentCoaching && recentTurns.length) {
    sources.push({
      id: "recent_coaching",
      label: "Recent coaching",
      summary: `${recentTurns.length} recent Ask LVE360 turn${recentTurns.length === 1 ? "" : "s"} used to understand follow-up wording.`,
      href: page === "other" ? "/today" : page === "blueprint" ? "/blueprints" : `/${page}`,
    });
    facts.recent_coaching = recentTurns.map((turn) => ({
      question: compact(turn.question, 240),
      answer: compact(turn.answer, 500),
    }));
  }

  const followUpContext = /\b(?:this|that|it|the first|the second|that option|those)\b/i.test(question)
    ? recentTurns.map((turn) => `${turn.question} ${turn.answer}`).join(" ").slice(0, 1200)
    : "";
  const evidenceOptions = needsEvidence ? retrieveCoachEvidence(`${question} ${followUpContext}`.trim()) : [];
  const namedCurrent = namedCurrentSupplements(question, memberContext);
  const profile = memberContext.healthProfile.value;
  const safetyContext: SafetyContext = {
    medications: memberContext.regimen.medications.value.map((item) => item.name),
    conditions: profile?.conditions ?? [],
    allergies: profile?.allergies ?? [],
    procedures: profile?.procedures ?? [],
    pregnant: profile?.pregnant ?? null,
  };
  const safetyCandidates = new Map<string, {
    name: string;
    dose: string | null;
    is_current: boolean;
    instruction_authority: string | null;
  }>();
  for (const option of evidenceOptions) {
      const current = supplementItems(memberContext).find((item) => healthItemIdentityKey(item.name) === healthItemIdentityKey(option.name));
      safetyCandidates.set(healthItemIdentityKey(option.name), {
        name: option.name,
        dose: current?.dose ?? option.doseGuidance?.startingDose ?? null,
        is_current: Boolean(current),
        instruction_authority: current?.instruction_authority ?? null,
      });
  }
  for (const current of namedCurrent) {
    safetyCandidates.set(healthItemIdentityKey(current.name), {
      name: current.name,
      dose: current.dose,
      is_current: true,
      instruction_authority: current.instruction_authority,
    });
  }
  const shouldRunNamedSafety = isSafetySensitiveQuestion(question) && namedCurrent.length > 0;
  const preSafety = (needsEvidence && evidenceOptions.length) || shouldRunNamedSafety
    ? await applySafetyChecks(safetyContext, [...safetyCandidates.values()])
    : null;
  const safetyByName = new Map(preSafety?.candidates.map((candidate) => [healthItemIdentityKey(candidate.name), candidate]) ?? []);
  facts.evidence_options = evidenceOptions.map((option) => {
    const safety = safetyByName.get(healthItemIdentityKey(option.name));
    const current = supplementItems(memberContext).find((item) => healthItemIdentityKey(item.name) === healthItemIdentityKey(option.name));
    return {
      id: option.id,
      name: option.name,
      best_fit: option.bestFit,
      evidence_strength: option.evidenceStrength,
      evidence_summary: option.evidenceSummary,
      citation_label: option.citationLabel,
      already_in_stack: Boolean(current),
      current_dose: current?.dose ?? null,
      current_timing: current?.timing ?? null,
      safety_status: safety?.decision === "blocked" ? "REMOVE" : safety?.decision === "review" ? "ALLOW_WITH_NOTE" : "ALLOW",
      safety_notes: safety?.findings.map((finding) => finding.message).slice(0, 3) ?? [],
      dose_guidance: routing.intent === "TIMING_OR_DOSING" ? option.doseGuidance : null,
    };
  });
  for (const option of evidenceOptions) {
    sources.push({
      id: option.id,
      label: `${option.name} evidence`,
      summary: `${option.evidenceStrength}: ${option.citationLabel}`,
      href: option.citationUrl,
    });
  }
  for (const candidate of preSafety?.candidates ?? []) {
    const evidence = candidate.evidence;
    if (!evidence?.sourceUrl || !evidence.sourceLabel) continue;
    const id = `safety_${healthItemIdentityKey(candidate.name)}`;
    if (sources.some((source) => source.id === id)) continue;
    sources.push({
      id,
      label: evidence.sourceLabel,
      summary: `${candidate.name} safety rule. Confidence: ${evidence.confidence}.`,
      href: evidence.sourceUrl,
    });
  }

  return {
    page,
    intent: routing.intent,
    constraints: routing.constraints,
    requestedRegimenKinds: routing.requestedRegimenKinds,
    memberContext,
    sources,
    facts,
    evidenceOptions,
    safetyContext,
    preSafety,
    namedSafetyCandidateKeys: namedCurrent.map((item) => healthItemIdentityKey(item.name)),
  };
}

type CoachRepairInstruction = {
  failedValidators: CoachTaskValidatorId[];
  missingRequirements: string[];
  constraintViolations: string[];
};

function prompt(question: string, context: CoachContext, repair: CoachRepairInstruction | null = null) {
  return [
    {
      role: "system" as const,
      content: [
        "You are Ask LVE360, an evidence-aware lifestyle coach for longevity, vitality, energy, and happiness.",
        "Saved LVE360 records describe this member; they personalize and constrain your answer but are not the whole knowledge base.",
        "Use the supplied curated evidence_options for supplement facts, comparisons, and evidence strength. Never invent a study, citation, interaction, diagnosis, symptom, or user fact.",
        "Answer the actual question in the first sentence. Do not lead with a disclaimer or say the Blueprint lacks the answer unless the user explicitly asks what the Blueprint says.",
        "You may explain, compare, rank, and recommend considering a supplement when the supplied evidence and safety status support it. You may explain dose or timing only when dose_guidance is supplied.",
        "Never direct a medication or hormone change. Never claim to diagnose, treat, cure, prevent, or manage disease. Never claim that a supplement is absolutely safe.",
        "Recommendation is not mutation: do not say a record, stack, routine, reminder, medication, hormone, or supplement was changed.",
        "The supplied explicit_constraints are hard limits. Do not propose changing a preserved medication, hormone, or supplement plan.",
        "For personalized recommendations, materially use relevant member facts, recognize already_in_stack items, prefer one change at a time, and end with a measurable next step.",
        "Do not recommend adding an already_in_stack item again. Discuss its recorded form, dose, or timing instead when available.",
        "Do not recommend an option whose safety_status is REMOVE. An ALLOW_WITH_NOTE option must retain its supplied safety note.",
        "Use supportive plain language and no shame. Keep the result concise enough for mobile use.",
        repair
          ? "The previous candidate failed task-success validation. Correct every supplied failed validator, missing requirement, and constraint violation. Do not merely rephrase the previous answer."
          : "",
        "Return only valid JSON with: intent, direct_answer, options, recommendation, next_step, source_ids, proposed_action.",
        "intent must exactly equal the supplied classified_intent; classification is controlled by the server.",
        "options is an array of {name, fit: strong|neutral|weak, reason}; use only exact names from evidence_options. recommendation is null or {candidate, reason, trial_period_days, metrics}. source_ids must use only supplied source IDs.",
        "proposed_action must be null unless the intent is BEHAVIORAL_COACHING, PRIORITIZATION, or PROGRESS_COACHING and one safe lifestyle practice directly follows from the answer. It must be non-null when the member explicitly asks for a next-week habit or practice and the answer provides one safe lifestyle action. When eligible, use this valid JSON shape: {\"type\":\"weekly_practice\",\"identity_direction\":\"movement\",\"action_label\":\"Take a 10-minute walk after lunch\",\"cue\":\"After lunch\",\"frequency_per_week\":5,\"minimum_version\":\"Walk for two minutes\",\"rationale\":\"This connects movement to a reliable meal cue.\"}. Replace the example values with the action supported by the answer. identity_direction must be one of movement, nutrition, sleep, emotional_health, relationships, focus, career, happiness, overall_health. Never put a medication, hormone, supplement, dose, test, clinician task, reminder, or saved-record change in proposed_action.",
      ].filter(Boolean).join(" "),
    },
    {
      role: "user" as const,
      content: JSON.stringify({
        question,
        classified_intent: context.intent,
        explicit_constraints: context.constraints,
        current_page: context.page,
        available_sources: context.sources.map(({ id, label, summary }) => ({ id, label, summary })),
        member_context_and_evidence: context.facts,
        repair_requirements: repair,
      }),
    },
  ];
}

function deterministicRecordMutation(question: string, context: CoachContext) {
  if (context.intent !== "REQUEST_TO_CHANGE_RECORD") return null;
  const option = context.evidenceOptions[0];
  const routine = Array.isArray(context.facts.routine) ? context.facts.routine as Array<Record<string, unknown>> : [];
  const existing = option
    ? routine.find((item) => healthItemIdentityKey(String(item.name ?? "")) === healthItemIdentityKey(option.name))
    : null;
  if (option && existing) {
    return {
      answer: `${option.name} is already in your current Routine${existing.dose ? ` at ${String(existing.dose)}` : ""}${existing.timing ? `, recorded for ${String(existing.timing)}` : ""}. I have not changed your saved records or added a duplicate. Use the controlled edit action on Routine if you need to review its exact form, dose, timing, or schedule.`,
      sourceIds: context.sources.filter((source) => source.id === "current_routine" || source.id === option.id).map((source) => source.id),
      responseSource: "deterministic" as const,
    };
  }
  const itemText = option ? ` Before adding ${option.name}, I can compare it with your current routine and run the LVE360 safety rules.` : " I can first explain the likely implications and review the relevant safety context.";
  return {
    answer: `I have not changed your saved records.${itemText} When you are ready, use the controlled add or edit action on Routine so you can review the exact name, dose, timing, and schedule before saving.`,
    sourceIds: context.sources.filter((source) => source.id === "current_routine" || source.id === option?.id).map((source) => source.id),
    responseSource: "deterministic" as const,
  };
}

function deterministicPlanLookup(question: string, context: CoachContext) {
  if (context.intent !== "CURRENT_PLAN_LOOKUP") return null;
  const routine = Array.isArray(context.facts.routine) ? context.facts.routine as Array<Record<string, unknown>> : [];
  const namedEvidence = context.evidenceOptions[0]?.name;
  if (namedEvidence) {
    const identity = healthItemIdentityKey(namedEvidence);
    const match = routine.find((item) => healthItemIdentityKey(String(item.name ?? "")) === identity);
    return {
      answer: match
        ? `Yes. ${String(match.name)} is already in your current Routine${match.dose ? ` at ${String(match.dose)}` : ""}${match.timing ? `, recorded for ${String(match.timing)}` : ""}. I would not add a duplicate. The useful next step is to review whether the recorded form, dose, and timing fit the goal you have in mind.`
        : `${namedEvidence} is not listed in your current Routine. This is a record lookup only; nothing has been added or changed.`,
      sourceIds: ["current_routine"],
      responseSource: "deterministic" as const,
    };
  }
  const nightOnly = /\b(?:night|evening|bed|bedtime)\b/i.test(question);
  const supplements = routine.filter((item) => ["supplement", "endocrine_active_supplement"].includes(String(item.kind ?? "")))
    .filter((item) => !nightOnly || /\b(?:night|evening|bed|pm|dinner)\b/i.test(String(item.timing ?? "")));
  const answer = supplements.length
    ? `${nightOnly ? "Your current nighttime supplements are" : "Your current supplements are"}:\n${supplements.map((item) => `• ${String(item.name)}${item.dose ? ` — ${String(item.dose)}` : ""}${item.timing ? ` (${String(item.timing)})` : ""}`).join("\n")}`
    : `I did not find any ${nightOnly ? "supplements with nighttime timing" : "current supplements"} in your saved Routine. No general recommendations were added because you asked for a record lookup.`;
  return { answer, sourceIds: ["current_routine"], responseSource: "deterministic" as const };
}

function deterministicTodayStep(question: string, context: CoachContext) {
  if (context.page !== "today" || context.intent !== "PROGRESS_COACHING" || !/\b(?:smallest|next step|today|right now)\b/i.test(question)) return null;
  const practice = context.facts.weekly_practice as { action?: unknown; minimum_version?: unknown } | undefined;
  const action = typeof practice?.action === "string" ? practice.action : null;
  const minimum = typeof practice?.minimum_version === "string" ? practice.minimum_version : null;
  if (!action || !minimum) return null;
  return {
    answer: `Use the minimum version of your current weekly practice: ${minimum}. That is the smallest version you already chose for ${action}. Completing it keeps today's decision tied to your active plan without adding another task.`,
    sourceIds: ["weekly_practice"], responseSource: "deterministic" as const,
  };
}

function deterministicJourneyPattern(question: string, context: CoachContext) {
  if (context.intent !== "PROGRESS_COACHING" || !/\b(?:pattern|recent progress|small win|build on)\b/i.test(question)) return null;
  const checkIns = Array.isArray(context.facts.recent_check_ins) ? context.facts.recent_check_ins as Array<Record<string, unknown>> : [];
  const sleep = checkIns.map((item) => Number(item.sleep_rating_out_of_5)).filter((value) => Number.isFinite(value) && value >= 0 && value <= 5);
  const energy = checkIns.map((item) => Number(item.energy_rating_out_of_10)).filter((value) => Number.isFinite(value) && value >= 0 && value <= 10);
  if (!sleep.length && !energy.length) return null;
  const average = (values: number[]) => (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1).replace(/\.0$/, "");
  const observations = [sleep.length ? `average sleep ${average(sleep)}/5` : null, energy.length ? `average energy ${average(energy)}/10` : null].filter(Boolean);
  return {
    answer: `Your recent check-ins show ${observations.join(" and ")}. These are observations, not proof that one habit caused the result. Keep the same small weekly practice and log on both completed and missed days so the next review can compare like with like.`,
    sourceIds: ["recent_check_ins", ...(context.facts.weekly_practice ? ["weekly_practice"] : [])],
    responseSource: "deterministic" as const,
  };
}

function fallbackStructured(question: string, context: CoachContext): StructuredCoachAnswer {
  const movementPractice = buildSafeNextWeekMovementFallback(question);
  if (movementPractice) {
    return {
      intent: context.intent,
      directAnswer: `${movementPractice.actionLabel} is a practical next-week experiment that keeps your saved Routine unchanged. ${movementPractice.rationale}`,
      options: [],
      recommendation: null,
      nextStep: "Preview this practice before deciding whether to save it for next week.",
      sourceIds: context.sources
        .filter((source) => ["weekly_practice", "goals", "current_blueprint"].includes(source.id))
        .map((source) => source.id),
      proposedAction: movementPractice,
    };
  }
  if (!context.evidenceOptions.length) {
    const blueprint = context.facts.blueprint as { priorities?: Array<{ label?: unknown }> } | undefined;
    const priorities = (blueprint?.priorities ?? []).map((item) => String(item.label ?? "")).filter(Boolean).slice(0, 3);
    const practice = context.facts.weekly_practice as { action?: unknown; completions?: unknown; target?: unknown } | undefined;
    const directAnswer = context.intent === "PLAN_EXPLANATION" && priorities.length
      ? `Your current Blueprint is organized around ${priorities.join(", ")}. Those are longer-term priorities; the weekly practice is where one of them becomes a small repeatable action.`
      : context.intent === "PROGRESS_COACHING" && practice?.action
        ? `Your active practice is ${String(practice.action)}, with ${Number(practice.completions ?? 0)} of ${Number(practice.target ?? 0)} planned repetitions recorded. That is the clearest current progress signal in LVE360.`
        : "I could not create the full personalized interpretation, but your saved LVE360 records are still available and unchanged.";
    return {
      intent: context.intent,
      directAnswer,
      options: [],
      recommendation: null,
      nextStep: context.intent === "PLAN_EXPLANATION" && priorities[0]
        ? `Choose one small weekly action connected to ${priorities[0]}.`
        : "Review the linked record, then ask one narrower follow-up question.",
      sourceIds: context.sources.map((source) => source.id),
      proposedAction: null,
    };
  }
  const safetyByName = new Map(context.preSafety?.candidates.map((candidate) => [healthItemIdentityKey(candidate.name), candidate]) ?? []);
  const available = context.evidenceOptions.filter((option) => safetyByName.get(healthItemIdentityKey(option.name))?.decision !== "blocked").slice(0, 3);
  const topic = /\bsleep\b/i.test(question) ? "sleep" : /\benergy|fatigue|tired\b/i.test(question) ? "energy" : "your goal";
  const recordedGoal = context.memberContext.goals.saved.value[0]?.label
    ?? context.memberContext.goals.blueprint.value[0]
    ?? null;
  const directAnswerBase = available.length
    ? `Several evidence-informed options may fit ${topic}, but they are useful for different reasons. The best choice depends on your current routine, the outcome you want, and the LVE360 safety checks.`
    : `The available LVE360 evidence options for ${topic} all require a higher level of review based on the information currently saved, so I would not select one as a new experiment yet.`;
  const directAnswer = recordedGoal
    ? `${directAnswerBase} Your recorded goal is ${recordedGoal}.`
    : directAnswerBase;
  const current = available.find((option) => safetyByName.get(healthItemIdentityKey(option.name))?.isCurrent);
  const selected = current ?? available[0] ?? null;
  return {
    intent: context.intent,
    directAnswer,
    options: available.map((option, index) => ({ name: option.name, fit: index === 0 ? "strong" : "neutral", reason: option.bestFit })),
    recommendation: selected ? {
      candidate: selected.name,
      reason: current ? `It is already in your Routine, so optimizing the recorded dose and timing is more useful than adding a duplicate.` : selected.bestFit,
      trialPeriodDays: current ? null : 14,
      metrics: /\bsleep\b/i.test(question) ? ["sleep quality", "time to fall asleep", "morning energy"] : ["energy", "consistency"],
    } : null,
    nextStep: selected
      ? current ? `Review the saved dose and timing for ${selected.name}; do not add a second product.` : `Change only one thing, then track the selected outcomes for 7–14 days before deciding whether it helped.`
      : "Review the highlighted safety notes before considering a new supplement.",
    sourceIds: [...context.sources.map((source) => source.id)],
    proposedAction: null,
  };
}

async function postValidate(question: string, context: CoachContext, answer: StructuredCoachAnswer) {
  if (!answer.options.length) return { answer, safety: context.preSafety, removed: 0 };
  const routine = Array.isArray(context.facts.routine) ? context.facts.routine as Array<Record<string, unknown>> : [];
  const candidates = answer.options.map((option) => {
    const evidence = evidenceOptionByName(context.evidenceOptions, option.name);
    const identity = healthItemIdentityKey(option.name);
    const current = routine.find((item) => healthItemIdentityKey(String(item.name ?? "")) === identity
      && ["supplement", "endocrine_active_supplement"].includes(String(item.kind ?? "")));
    return {
      name: option.name,
      dose: current?.dose ? String(current.dose) : evidence?.doseGuidance?.startingDose ?? null,
      is_current: Boolean(current),
      instruction_authority: current?.instruction_authority ? String(current.instruction_authority) : null,
    };
  });
  const safety = await applySafetyChecks(context.safetyContext, candidates);
  const decisions = new Map(safety.candidates.map((candidate) => [healthItemIdentityKey(candidate.name), candidate]));
  const options = answer.options.filter((option) => decisions.get(healthItemIdentityKey(option.name))?.decision !== "blocked");
  let recommendation = answer.recommendation && options.some((option) => option.name === answer.recommendation?.candidate)
    ? answer.recommendation
    : null;
  const explicitlyNamed = explicitlyNamedEvidenceOption(question, context.evidenceOptions);
  const namedAnswerOption = explicitlyNamed
    ? options.find((option) => healthItemIdentityKey(option.name) === healthItemIdentityKey(explicitlyNamed.name))
    : null;
  if (namedAnswerOption && recommendation?.candidate !== namedAnswerOption.name) {
    recommendation = {
      candidate: namedAnswerOption.name,
      reason: namedAnswerOption.reason,
      trialPeriodDays: recommendation?.trialPeriodDays ?? null,
      metrics: recommendation?.metrics ?? [],
    };
  }
  const recommendationSafety = recommendation
    ? decisions.get(healthItemIdentityKey(recommendation.candidate))
    : null;
  const requiresReviewBeforeStart = Boolean(recommendationSafety
    && !recommendationSafety.isCurrent
    && recommendationSafety.decision === "review");
  const isCurrentRecommendation = Boolean(recommendationSafety?.isCurrent);
  const reviewedAnswer = isCurrentRecommendation && recommendation
    ? {
        ...answer,
        directAnswer: `${recommendation.candidate} is already in your current Routine, so I would not add it again. The useful question is whether its recorded form, dose, and timing fit your sleep goal.`,
        options,
        recommendation,
        nextStep: `Review the saved form, dose, and timing for ${recommendation.candidate}, then track the outcomes below without adding a duplicate.`,
      }
    : requiresReviewBeforeStart && recommendation
    ? {
        ...answer,
        directAnswer: `I would not start a new supplement from this answer alone. ${recommendation.candidate} is an evidence-informed option to discuss with a qualified professional, but LVE360 flagged a safety review before any new start.`,
        options,
        recommendation,
        nextStep: `Review ${recommendation.candidate} and the safety note above with your clinician or healthcare provider before starting it. Keep your saved Routine unchanged until that review is complete.`,
      }
    : { ...answer, options, recommendation };
  return { answer: reviewedAnswer, safety, removed: answer.options.length - options.length };
}

function renderAnswer(answer: StructuredCoachAnswer, context: CoachContext, safety: AppliedSafetyResult | null) {
  const evidenceByName = new Map(context.evidenceOptions.map((option) => [healthItemIdentityKey(option.name), option]));
  const safetyByName = new Map(safety?.candidates.map((candidate) => [healthItemIdentityKey(candidate.name), candidate]) ?? []);
  const lines = [answer.directAnswer];
  if (answer.options.length) {
    lines.push("", "Options worth comparing:");
    answer.options.forEach((option, index) => {
      const evidence = evidenceByName.get(healthItemIdentityKey(option.name));
      const safetyResult = safetyByName.get(healthItemIdentityKey(option.name));
      const current = safetyResult?.isCurrent ? " Already in your Routine." : "";
      lines.push(`${index + 1}. ${option.name} — ${evidence?.evidenceStrength ?? "Evidence not graded"}. ${option.reason}${current}`);
      const note = safetyResult?.findings[0]?.message;
      if (note) lines.push(`   Safety note: ${note.slice(0, 280)}`);
    });
  }
  if (answer.recommendation) {
    const safetyResult = safetyByName.get(healthItemIdentityKey(answer.recommendation.candidate));
    lines.push("", `Why this fits you: ${answer.recommendation.reason}`);
    if (safetyResult?.isCurrent) {
      lines.push(`You already take ${answer.recommendation.candidate}, so do not add a duplicate. Review the recorded form, dose, and timing instead.`);
    } else if (safetyResult?.decision === "clear") {
      lines.push("No major conflict was identified by the structured LVE360 rules using the information currently saved. This is not an absolute guarantee of safety.");
    }
    if (answer.recommendation.trialPeriodDays || answer.recommendation.metrics.length) {
      lines.push(`Experiment: ${answer.recommendation.trialPeriodDays ? `${answer.recommendation.trialPeriodDays} days` : "one change at a time"}${answer.recommendation.metrics.length ? `; track ${answer.recommendation.metrics.join(", ")}` : ""}.`);
    }
  }
  lines.push("", `Next step: ${answer.nextStep}`);
  return lines.join("\n");
}

function validateRenderedTask(
  routing: CoachRoutingDecision,
  question: string,
  context: CoachContext,
  answerText: string,
  structuredAnswer: StructuredCoachAnswer | null,
  safetyChecked: boolean,
) {
  return validateCoachTaskSuccess({
    route: routing,
    question,
    answerText,
    memberContext: context.memberContext,
    structuredAnswer,
    evidenceOptionNames: context.evidenceOptions.map((option) => option.name),
    safetyChecked,
    allCandidatesBlocked: Boolean(
      context.preSafety?.candidates.length
      && context.preSafety.candidates.every((candidate) => candidate.decision === "blocked"),
    ),
  });
}

function repairInstruction(report: CoachTaskSuccessReport): CoachRepairInstruction {
  return {
    failedValidators: report.failedValidators,
    missingRequirements: report.missingRequirements,
    constraintViolations: report.constraintViolations,
  };
}

function narrowSafeFallback(context: CoachContext) {
  const sourceIds = context.sources
    .filter((source) => !source.id.startsWith("evidence_"))
    .map((source) => source.id);
  return {
    answer: "I could not verify a complete, grounded answer to this request, so I will not guess. Your saved information and Routine are unchanged. Review the linked LVE360 record, then try one narrower question.",
    sourceIds,
    responseSource: "fallback" as const,
    proposedAction: null,
  };
}

function diagnosticsFromReport(
  context: CoachContext,
  report: CoachTaskSuccessReport,
  values: {
    safetyRuleCount: number;
    recommendationsRemoved: number;
    regenerationCount: number;
    evidenceIds: string[];
    repairReason: CoachDiagnostics["repairReason"];
    fallbackReason: CoachDiagnostics["fallbackReason"];
  },
): CoachDiagnostics {
  return {
    intent: context.intent,
    constraints: context.constraints,
    qualityScore: report.score,
    safetyRuleCount: values.safetyRuleCount,
    recommendationsRemoved: values.recommendationsRemoved,
    regenerationCount: values.regenerationCount,
    evidenceIds: values.evidenceIds,
    taskPassed: report.passed,
    taskCompleteness: report.completeness,
    factualCoverage: report.factualCoverage,
    failedValidators: report.failedValidators,
    missingRequirementCount: report.missingRequirements.length,
    constraintViolationCount: report.constraintViolations.length,
    repairReason: values.repairReason,
    fallbackReason: values.fallbackReason,
  };
}

function formatSafetyNumber(value: number) {
  return Number.isInteger(value) ? value.toLocaleString("en-US") : Number(value.toFixed(2)).toLocaleString("en-US");
}

function evidenceDetail(candidate: AppliedSafetyResult["candidates"][number]) {
  const evidence = candidate.findings.find((finding) => finding.evidence?.provenanceStatus === "reviewed")?.evidence
    ?? candidate.evidence;
  if (!evidence) return "Evidence provenance for this exact item is not yet fully reviewed.";
  const qualification = evidence.qualification ? ` Important context: ${evidence.qualification}` : "";
  return `Evidence: ${evidence.sourceLabel ?? "LVE360 structured safety rule"}. Confidence: ${evidence.confidence}.${qualification}`;
}

function deterministicNamedSafetyAnswer(question: string, context: CoachContext) {
  if (!isSafetySensitiveQuestion(question) || !context.preSafety?.complete || !context.namedSafetyCandidateKeys.length) return null;
  const named = new Set(context.namedSafetyCandidateKeys);
  const candidates = context.preSafety.candidates.filter((candidate) => named.has(healthItemIdentityKey(candidate.name)));
  if (!candidates.length) return null;
  const sourceIds = [
    "current_routine",
    "health_profile",
    ...candidates.map((candidate) => `safety_${healthItemIdentityKey(candidate.name)}`),
  ].filter((id) => context.sources.some((source) => source.id === id));

  if (/\b(?:upper[- ]?intake|upper limit|threshold|above the general)\b/i.test(question)) {
    const candidate = candidates.find((item) => item.findings.some((finding) => finding.code === "upper_limit"));
    const finding = candidate?.findings.find((item) => item.code === "upper_limit");
    if (candidate && finding?.doseComparison) {
      const comparison = finding.doseComparison;
      const threshold = comparison.thresholdInRecordedUnit != null && comparison.recordedUnit
        ? `${formatSafetyNumber(comparison.thresholdInRecordedUnit)} ${comparison.recordedUnit.toUpperCase()}`
        : `${formatSafetyNumber(comparison.thresholdAmount)} ${comparison.thresholdUnit}`;
      const equivalent = comparison.thresholdInRecordedUnit != null
        && comparison.recordedUnit !== comparison.thresholdUnit
        ? ` (${formatSafetyNumber(comparison.thresholdAmount)} ${comparison.thresholdUnit})`
        : "";
      return {
        answer: `Yes. Your current ${candidate.name} dose is recorded as ${comparison.recordedDose}. The general adult upper-intake threshold in LVE360's reviewed rule is ${threshold}${equivalent}, so the recorded dose is above that general threshold.\n\n${finding.message}\n\n${evidenceDetail(candidate)}`,
        sourceIds,
        responseSource: "deterministic" as const,
      };
    }
  }

  if (/\b(?:thyroid|levothyroxine|separat|spacing|interact|interaction|review)\b/i.test(question)) {
    const lines = candidates.map((candidate) => {
      const timingFindings = candidate.findings.filter((finding) => ["thyroid_spacing", "medication_spacing"].includes(finding.code));
      if (timingFindings.length) {
        return `- ${candidate.name}: ${timingFindings.map((finding) => finding.message).join(" ")} ${evidenceDetail(candidate)}`;
      }
      if (candidate.evidence?.provenanceStatus === "reviewed") {
        return `- ${candidate.name}: LVE360's reviewed structured rule did not identify a general requirement to separate this recorded form from thyroid medication. ${evidenceDetail(candidate)}`;
      }
      return `- ${candidate.name}: LVE360 did not identify a thyroid-spacing rule, but provenance for this exact form is incomplete, so this is not a clearance.`;
    });
    const hasTimingFinding = candidates.some((candidate) => candidate.findings.some((finding) => ["thyroid_spacing", "medication_spacing"].includes(finding.code)));
    return {
      answer: `${hasTimingFinding ? "Here is the current deterministic timing review" : "LVE360 did not identify a general thyroid-spacing requirement for the exact Routine items you named"}:\n\n${lines.join("\n")}\n\nThis is not a guarantee that every product or circumstance is risk-free. Keep prescription instructions unchanged and confirm any conflicting product label or new clinical circumstance with your clinician or healthcare provider.`,
      sourceIds,
      responseSource: "deterministic" as const,
    };
  }
  return null;
}

export async function generateCoachAnswer(userId: string, question: string, context: CoachContext) {
  const routing: CoachRoutingDecision = {
    intent: context.intent,
    constraints: context.constraints,
    requestedRegimenKinds: context.requestedRegimenKinds,
  };
  const deterministic = deterministicNamedSafetyAnswer(question, context)
    ?? deterministicCoachTask(routing, context.memberContext, question)
    ?? deterministicRecordMutation(question, context)
    ?? deterministicPlanLookup(question, context)
    ?? deterministicTodayStep(question, context)
    ?? deterministicJourneyPattern(question, context);
  if (deterministic) {
    const taskReport = validateRenderedTask(routing, question, context, deterministic.answer, null, true);
    if (!taskReport.passed) {
      const fallback = narrowSafeFallback(context);
      return {
        ...fallback,
        diagnostics: diagnosticsFromReport(context, taskReport, {
          safetyRuleCount: context.preSafety?.findings.length ?? 0,
          recommendationsRemoved: 0,
          regenerationCount: 0,
          evidenceIds: context.evidenceOptions.map((option) => option.id),
          repairReason: null,
          fallbackReason: "deterministic_validation_failed",
        }),
      };
    }
    return {
      ...deterministic,
      proposedAction: null,
      diagnostics: diagnosticsFromReport(context, taskReport, {
        safetyRuleCount: context.preSafety?.findings.length ?? 0,
        recommendationsRemoved: 0,
        regenerationCount: 0,
        evidenceIds: context.evidenceOptions.map((option) => option.id),
        repairReason: null,
        fallbackReason: null,
      }),
    };
  }

  const validSourceIds = new Set(context.sources.map((source) => source.id));
  const allowedNames = new Set(context.evidenceOptions.map((option) => option.name.toLowerCase()));
  const safetyChecked = !context.evidenceOptions.length || Boolean(context.preSafety?.complete);
  let regenerationCount = 0;
  let repairReason: CoachDiagnostics["repairReason"] = null;
  let fallbackReason: CoachDiagnostics["fallbackReason"] = null;
  let finalValidated: Awaited<ReturnType<typeof postValidate>> | null = null;
  let finalRendered = "";
  let finalReport: CoachTaskSuccessReport | null = null;
  let responseSource: "ai" | "fallback" = "ai";

  const evaluateProposal = async (proposal: StructuredCoachAnswer) => {
    const validated = await postValidate(question, context, proposal);
    const rendered = renderAnswer(validated.answer, context, validated.safety);
    const report = validateRenderedTask(
      routing,
      question,
      context,
      rendered,
      validated.answer,
      validated.answer.options.length === 0 || Boolean(validated.safety?.complete),
    );
    return { validated, rendered, report };
  };

  let firstProposal: StructuredCoachAnswer | null = null;
  try {
    const response = await generateAI({
      task: "contextual_coach",
      userId,
      messages: prompt(question, context),
      maxTokens: 650,
      timeoutMs: 20_000,
      temperature: 0.2,
    });
    firstProposal = parseStructuredCoachAnswer(response.text, context.intent, validSourceIds, allowedNames);
  } catch (error) {
    fallbackReason = "model_unavailable";
    console.warn("[coach.generation] model unavailable; using grounded fallback", error);
  }

  if (firstProposal) {
    const evaluated = await evaluateProposal(firstProposal);
    finalValidated = evaluated.validated;
    finalRendered = evaluated.rendered;
    finalReport = evaluated.report;
  } else if (!fallbackReason) {
    finalReport = validateRenderedTask(routing, question, context, "", null, safetyChecked);
    repairReason = "parse_failed";
  }

  if (!fallbackReason && finalReport && !finalReport.passed) {
    regenerationCount = 1;
    repairReason ??= "task_validation_failed";
    try {
      const repairResponse = await generateAI({
        task: "contextual_coach",
        userId,
        messages: prompt(question, context, repairInstruction(finalReport)),
        maxTokens: 650,
        timeoutMs: 20_000,
        temperature: 0.1,
      });
      const repairedProposal = parseStructuredCoachAnswer(repairResponse.text, context.intent, validSourceIds, allowedNames);
      if (repairedProposal) {
        const repaired = await evaluateProposal(repairedProposal);
        finalValidated = repaired.validated;
        finalRendered = repaired.rendered;
        finalReport = repaired.report;
      } else {
        fallbackReason = "repair_failed";
      }
    } catch (error) {
      fallbackReason = "repair_failed";
      console.warn("[coach.generation] bounded repair unavailable; using grounded fallback", error);
    }
  }

  if (!finalReport?.passed) {
    responseSource = "fallback";
    fallbackReason ??= "repair_failed";
    const fallback = await evaluateProposal(fallbackStructured(question, context));
    finalValidated = fallback.validated;
    finalRendered = fallback.rendered;
    finalReport = fallback.report;
  }

  if (!finalValidated || !finalReport || !finalReport.passed) {
    const safe = narrowSafeFallback(context);
    const report = finalReport ?? validateRenderedTask(routing, question, context, safe.answer, null, safetyChecked);
    return {
      ...safe,
      diagnostics: diagnosticsFromReport(context, report, {
        safetyRuleCount: context.preSafety?.findings.length ?? 0,
        recommendationsRemoved: finalValidated?.removed ?? 0,
        regenerationCount,
        evidenceIds: [],
        repairReason,
        fallbackReason: fallbackReason ?? "repair_failed",
      }),
    };
  }

  const evidenceIds = finalValidated.answer.options
    .map((option) => evidenceOptionByName(context.evidenceOptions, option.name)?.id)
    .filter((id): id is string => Boolean(id));
  const sourceIds = [...new Set([
    ...finalValidated.answer.sourceIds,
    ...evidenceIds,
    ...(finalValidated.safety?.findings.length && validSourceIds.has("current_routine") ? ["current_routine"] : []),
    ...(finalValidated.safety?.findings.length && validSourceIds.has("health_profile") ? ["health_profile"] : []),
  ])].filter((id) => validSourceIds.has(id));
  return {
    answer: finalRendered,
    sourceIds,
    responseSource,
    proposedAction: finalValidated.answer.proposedAction ?? null,
    diagnostics: diagnosticsFromReport(context, finalReport, {
      safetyRuleCount: finalValidated.safety?.findings.length ?? 0,
      recommendationsRemoved: finalValidated.removed,
      regenerationCount,
      evidenceIds,
      repairReason,
      fallbackReason,
    }),
  };
}
