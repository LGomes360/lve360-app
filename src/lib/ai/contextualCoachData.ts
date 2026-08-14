import "server-only";

import { identityLabel, type WeeklyExperiment } from "@/lib/activation";
import { generateAI } from "@/lib/ai/gateway";
import { evidenceOptionByName, retrieveCoachEvidence, type CoachEvidenceOption } from "@/lib/coachEvidence";
import {
  assessCoachAnswerQuality,
  parseStructuredCoachAnswer,
  type CoachIntent,
  type CoachPage,
  type CoachQualityReport,
  type CoachSource,
  type StructuredCoachAnswer,
} from "@/lib/contextualCoach";
import { getCurrentBlueprintContext } from "@/lib/currentBlueprintContext";
import { getCurrentRegimen } from "@/lib/currentRegimen";
import { healthItemIdentityKey } from "@/lib/healthItemIdentity";
import { applySafetyChecks, type AppliedSafetyResult } from "@/lib/safetyCheck";
import type { SafetyContext } from "@/lib/safetyEngine";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export type CoachContext = {
  page: CoachPage;
  intent: CoachIntent;
  sources: CoachSource[];
  facts: Record<string, unknown>;
  evidenceOptions: CoachEvidenceOption[];
  safetyContext: SafetyContext;
  preSafety: AppliedSafetyResult | null;
};

export type CoachDiagnostics = {
  intent: CoachIntent;
  qualityScore: number;
  safetyRuleCount: number;
  recommendationsRemoved: number;
  regenerationCount: number;
  evidenceIds: string[];
};

const INTENT_SOURCE_IDS: Record<CoachIntent, string[]> = {
  GENERAL_EDUCATION: ["evidence", "current_routine", "health_profile", "recent_coaching"],
  PERSONALIZED_RECOMMENDATION: ["evidence", "current_routine", "health_profile", "goals", "recent_check_ins", "current_blueprint", "recent_coaching"],
  CURRENT_PLAN_LOOKUP: ["current_routine"],
  OPTION_COMPARISON: ["evidence", "current_routine", "health_profile", "goals", "recent_check_ins", "recent_coaching"],
  PLAN_EXPLANATION: ["current_blueprint", "current_routine", "goals", "recent_coaching"],
  TIMING_OR_DOSING: ["evidence", "current_routine", "health_profile", "recent_coaching"],
  PROGRESS_COACHING: ["weekly_practice", "recent_check_ins", "goals", "current_blueprint", "recent_coaching"],
  REQUEST_TO_CHANGE_RECORD: ["current_routine", "evidence", "health_profile"],
  POTENTIAL_MEDICAL_RED_FLAG: [],
};

const FACT_KEY_BY_SOURCE: Record<string, string> = {
  current_blueprint: "blueprint",
  current_routine: "routine",
  weekly_practice: "weekly_practice",
  recent_check_ins: "recent_check_ins",
  goals: "goals",
  health_profile: "health_profile",
  recent_coaching: "recent_coaching",
};

function compact(value: string | null | undefined, length = 160) {
  return value?.replace(/\s+/g, " ").trim().slice(0, length) || null;
}

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

function calculateAge(dob: unknown) {
  if (typeof dob !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dob)) return null;
  const born = new Date(`${dob}T00:00:00Z`);
  if (Number.isNaN(born.getTime())) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - born.getUTCFullYear();
  const beforeBirthday = now.getUTCMonth() < born.getUTCMonth()
    || (now.getUTCMonth() === born.getUTCMonth() && now.getUTCDate() < born.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age >= 13 && age <= 120 ? age : null;
}

function scopeContext(context: CoachContext): CoachContext {
  const allowed = new Set(INTENT_SOURCE_IDS[context.intent]);
  const sources = context.sources.filter((source) => source.id.startsWith("evidence_") ? allowed.has("evidence") : allowed.has(source.id));
  const facts = Object.fromEntries(sources.flatMap((source) => {
    if (source.id.startsWith("evidence_")) return [];
    const key = FACT_KEY_BY_SOURCE[source.id];
    return key && key in context.facts ? [[key, context.facts[key]]] : [];
  }));
  if (allowed.has("evidence")) facts.evidence_options = context.facts.evidence_options;
  return { ...context, sources, facts };
}

function supplementItems(regimen: Awaited<ReturnType<typeof getCurrentRegimen>>) {
  return regimen.filter((item) => item.item_kind === "supplement" || item.item_kind === "endocrine_active_supplement");
}

function isCurrentSupplement(name: string, regimen: Awaited<ReturnType<typeof getCurrentRegimen>>) {
  const identity = healthItemIdentityKey(name);
  return supplementItems(regimen).some((item) => healthItemIdentityKey(item.name) === identity);
}

export async function buildCoachContext(userId: string, page: CoachPage, question: string, intent: CoachIntent): Promise<CoachContext> {
  const admin = getSupabaseAdmin();
  const requested = new Set(INTENT_SOURCE_IDS[intent]);
  const needsEvidence = requested.has("evidence");
  const emptyResult = { data: null, error: null };
  const [blueprint, regimen, experimentResult, checkInsResult, goalsResult, submissionResult, recentTurnsResult] = await Promise.all([
    requested.has("current_blueprint") ? getCurrentBlueprintContext(userId) : Promise.resolve(null),
    requested.has("current_routine") || needsEvidence ? getCurrentRegimen(userId) : Promise.resolve([]),
    requested.has("weekly_practice") ? admin.from("weekly_experiments")
      .select("id,identity_direction,action_label,cue,frequency_per_week,minimum_version,week_start,status")
      .eq("user_id", userId).eq("status", "active").order("updated_at", { ascending: false }).limit(1).maybeSingle() : Promise.resolve(emptyResult),
    requested.has("recent_check_ins") ? admin.from("logs").select("log_date,weight,sleep,energy")
      .eq("user_id", userId).order("log_date", { ascending: false }).limit(7) : Promise.resolve({ data: [], error: null }),
    requested.has("goals") ? admin.from("goals").select("goals,custom_goal,target_weight,target_sleep,target_energy")
      .eq("user_id", userId).maybeSingle() : Promise.resolve(emptyResult),
    requested.has("health_profile") || needsEvidence ? admin.from("submissions")
      .select("dob,sex,gender,conditions,allergies,pregnant,dosing_pref,brand_pref,engine_input_json,goals")
      .eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle() : Promise.resolve(emptyResult),
    requested.has("recent_coaching") ? admin.from("ai_coaching_turns")
      .select("question,answer,created_at").eq("user_id", userId).neq("generation_status", "pending")
      .order("created_at", { ascending: false }).limit(3) : Promise.resolve({ data: [], error: null }),
  ]);
  for (const result of [experimentResult, checkInsResult, goalsResult, submissionResult, recentTurnsResult]) {
    if (result.error) throw result.error;
  }

  const sources: CoachSource[] = [];
  const facts: Record<string, unknown> = {};
  if (blueprint) {
    sources.push({
      id: "current_blueprint",
      label: "Current Blueprint",
      summary: `${blueprint.priorities.length} priorities; ${blueprint.needs_refresh ? "saved changes await review" : "current with saved information"}.`,
      href: `/blueprints/${blueprint.stack_id}`,
    });
    facts.blueprint = {
      generated_at: blueprint.created_at,
      safety_status: blueprint.safety_status,
      safety_acknowledged: blueprint.safety_acknowledged,
      needs_refresh: blueprint.needs_refresh,
      priorities: blueprint.priorities.slice(0, 8).map((item) => ({ label: compact(item.label), category: item.category, kind: item.kind })),
    };
  }
  if (regimen.length) {
    sources.push({ id: "current_routine", label: "Current Routine", summary: `${regimen.length} active medication, hormone, and supplement records.`, href: "/routine" });
    facts.routine = regimen.slice(0, 40).map((item) => ({
      kind: item.item_kind,
      name: compact(item.name, 100),
      dose: compact(item.dose, 80),
      timing: compact(item.timing, 100),
      purpose: compact(item.purpose, 120),
      instruction_authority: item.instruction_authority,
    }));
  }

  const experiment = experimentResult.data as Partial<WeeklyExperiment> | null;
  if (experiment?.id) {
    const completionResult = await admin.from("daily_practice_completions")
      .select("id", { count: "exact", head: true }).eq("user_id", userId).eq("experiment_id", experiment.id);
    if (completionResult.error) throw completionResult.error;
    sources.push({ id: "weekly_practice", label: "Weekly Practice", summary: `${completionResult.count ?? 0} completions recorded toward this week's ${experiment.frequency_per_week ?? 0}-day target.`, href: "/today" });
    facts.weekly_practice = {
      identity: identityLabel(experiment.identity_direction ?? null),
      action: compact(experiment.action_label),
      cue: compact(experiment.cue),
      minimum_version: compact(experiment.minimum_version),
      target: experiment.frequency_per_week,
      completions: completionResult.count ?? 0,
      week_start: experiment.week_start,
    };
  }

  const checkIns = checkInsResult.data ?? [];
  if (checkIns.length) {
    sources.push({ id: "recent_check_ins", label: "Recent check-ins", summary: `${checkIns.length} recent weight, sleep, or energy entries.`, href: "/journey" });
    facts.recent_check_ins = checkIns.map((item) => ({ date: item.log_date, weight: item.weight, sleep_rating_out_of_5: item.sleep, energy_rating_out_of_10: item.energy }));
  }

  const goals = goalsResult.data;
  const goalNames = [...new Set([
    ...readableValues(goals?.goals),
    ...readableValues(goals?.custom_goal),
  ])].slice(0, 8);
  if (goalNames.length || goals?.target_weight != null || goals?.target_sleep != null || goals?.target_energy != null) {
    sources.push({ id: "goals", label: "Goals", summary: `${goalNames.length} saved goal${goalNames.length === 1 ? "" : "s"} and dashboard targets.`, href: "/settings" });
    facts.goals = {
      names: goalNames,
      target_weight: goals?.target_weight ?? null,
      target_sleep_out_of_5: goals?.target_sleep ?? null,
      target_energy_out_of_10: goals?.target_energy ?? null,
    };
  }

  const submission = submissionResult.data;
  const engine = objectValue(submission?.engine_input_json);
  const client = objectValue(engine.client ?? engine);
  const conditions = [...new Set(readableValues(client.conditions ?? submission?.conditions))].slice(0, 12);
  const allergies = [...new Set(readableValues(client.allergies ?? submission?.allergies))].slice(0, 12);
  const procedures = [...new Set(readableValues(client.procedures ?? client.upcoming_procedures ?? client.surgeries))].slice(0, 8);
  const healthProfile = {
    age: calculateAge(submission?.dob),
    sex: compact(String(submission?.sex ?? submission?.gender ?? client.sex ?? client.gender ?? ""), 40),
    conditions,
    allergies,
    procedures,
    pregnant: client.pregnant ?? submission?.pregnant ?? null,
    dosing_preference: compact(String(submission?.dosing_pref ?? client.dosing_pref ?? ""), 100),
    brand_preference: compact(String(submission?.brand_pref ?? client.brand_pref ?? ""), 100),
  };
  if (Object.values(healthProfile).some((value) => Array.isArray(value) ? value.length > 0 : value != null && value !== "")) {
    sources.push({ id: "health_profile", label: "Health profile", summary: "Saved age/life-stage, conditions, allergies, procedures, and preferences used only when relevant.", href: "/settings" });
    facts.health_profile = healthProfile;
  }

  const recentTurns = recentTurnsResult.data ?? [];
  if (recentTurns.length) {
    sources.push({ id: "recent_coaching", label: "Recent coaching", summary: `${recentTurns.length} recent Ask LVE360 turn${recentTurns.length === 1 ? "" : "s"} used to understand follow-up wording.`, href: page === "other" ? "/today" : page === "blueprint" ? "/blueprints" : `/${page}` });
    facts.recent_coaching = recentTurns.map((turn) => ({
      question: compact(turn.question, 240),
      answer: compact(turn.answer, 500),
    }));
  }

  const followUpContext = /\b(?:this|that|it|the first|the second|that option|those)\b/i.test(question)
    ? recentTurns.map((turn) => `${turn.question} ${turn.answer}`).join(" ").slice(0, 1200)
    : "";
  const evidenceOptions = retrieveCoachEvidence(`${question} ${followUpContext}`.trim());
  const safetyContext: SafetyContext = {
    medications: regimen.filter((item) => item.item_kind === "medication").map((item) => item.name),
    conditions,
    allergies,
    procedures,
    pregnant: typeof healthProfile.pregnant === "boolean" || typeof healthProfile.pregnant === "string" ? healthProfile.pregnant : null,
  };
  const preSafety = needsEvidence && evidenceOptions.length ? await applySafetyChecks(safetyContext, evidenceOptions.map((option) => ({
    name: option.name,
    dose: option.doseGuidance?.startingDose ?? null,
    is_current: isCurrentSupplement(option.name, regimen),
  }))) : null;
  const safetyByName = new Map(preSafety?.candidates.map((candidate) => [healthItemIdentityKey(candidate.name), candidate]) ?? []);
  facts.evidence_options = evidenceOptions.map((option) => {
    const safety = safetyByName.get(healthItemIdentityKey(option.name));
    const current = supplementItems(regimen).find((item) => healthItemIdentityKey(item.name) === healthItemIdentityKey(option.name));
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
      dose_guidance: intent === "TIMING_OR_DOSING" ? option.doseGuidance : null,
    };
  });
  for (const option of evidenceOptions) {
    sources.push({ id: option.id, label: `${option.name} evidence`, summary: `${option.evidenceStrength}: ${option.citationLabel}`, href: option.citationUrl });
  }

  return scopeContext({ page, intent, sources, facts, evidenceOptions, safetyContext, preSafety });
}

function supplementQuestion(question: string, context: CoachContext) {
  return context.evidenceOptions.length > 0 || /\b(?:supplement|vitamin|mineral|magnesium|glycine|melatonin|theanine|creatine|coq10|b[- ]?12|omega[- ]?3|ashwagandha)\b/i.test(question);
}

function prompt(question: string, context: CoachContext, repair = false) {
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
        "For personalized recommendations, materially use relevant member facts, recognize already_in_stack items, prefer one change at a time, and end with a measurable next step.",
        "Do not recommend adding an already_in_stack item again. Discuss its recorded form, dose, or timing instead when available.",
        "Do not recommend an option whose safety_status is REMOVE. An ALLOW_WITH_NOTE option must retain its supplied safety note.",
        "Use supportive plain language and no shame. Keep the result concise enough for mobile use.",
        repair ? "The previous candidate failed the quality gate. Be concrete, name supported options when asked, and include a useful next step." : "",
        "Return only valid JSON with: intent, direct_answer, options, recommendation, next_step, source_ids.",
        "options is an array of {name, fit: strong|neutral|weak, reason}; use only exact names from evidence_options. recommendation is null or {candidate, reason, trial_period_days, metrics}. source_ids must use only supplied source IDs.",
      ].filter(Boolean).join(" "),
    },
    {
      role: "user" as const,
      content: JSON.stringify({
        question,
        classified_intent: context.intent,
        current_page: context.page,
        available_sources: context.sources.map(({ id, label, summary }) => ({ id, label, summary })),
        member_context_and_evidence: context.facts,
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
  if (context.page !== "today" || context.intent !== "PROGRESS_COACHING" || !/\b(?:smallest|next|today|right now)\b/i.test(question)) return null;
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
    };
  }
  const safetyByName = new Map(context.preSafety?.candidates.map((candidate) => [healthItemIdentityKey(candidate.name), candidate]) ?? []);
  const available = context.evidenceOptions.filter((option) => safetyByName.get(healthItemIdentityKey(option.name))?.decision !== "blocked").slice(0, 3);
  const topic = /\bsleep\b/i.test(question) ? "sleep" : /\benergy|fatigue|tired\b/i.test(question) ? "energy" : "your goal";
  const directAnswer = available.length
    ? `Several evidence-informed options may fit ${topic}, but they are useful for different reasons. The best choice depends on your current routine, the outcome you want, and the LVE360 safety checks.`
    : `The available LVE360 evidence options for ${topic} all require a higher level of review based on the information currently saved, so I would not select one as a new experiment yet.`;
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
  };
}

async function postValidate(context: CoachContext, answer: StructuredCoachAnswer) {
  if (!answer.options.length) return { answer, safety: context.preSafety, removed: 0 };
  const routine = Array.isArray(context.facts.routine) ? context.facts.routine as Array<Record<string, unknown>> : [];
  const candidates = answer.options.map((option) => {
    const evidence = evidenceOptionByName(context.evidenceOptions, option.name);
    const identity = healthItemIdentityKey(option.name);
    const current = routine.find((item) => healthItemIdentityKey(String(item.name ?? "")) === identity
      && ["supplement", "endocrine_active_supplement"].includes(String(item.kind ?? "")));
    return { name: option.name, dose: current?.dose ? String(current.dose) : evidence?.doseGuidance?.startingDose ?? null, is_current: Boolean(current) };
  });
  const safety = await applySafetyChecks(context.safetyContext, candidates);
  const decisions = new Map(safety.candidates.map((candidate) => [healthItemIdentityKey(candidate.name), candidate]));
  const options = answer.options.filter((option) => decisions.get(healthItemIdentityKey(option.name))?.decision !== "blocked");
  const recommendation = answer.recommendation && options.some((option) => option.name === answer.recommendation?.candidate)
    ? answer.recommendation
    : null;
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
        nextStep: `Review ${recommendation.candidate} and the safety note above with your clinician or pharmacist before starting it. Keep your saved Routine unchanged until that review is complete.`,
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

export async function generateCoachAnswer(userId: string, question: string, context: CoachContext) {
  const deterministic = deterministicRecordMutation(question, context)
    ?? deterministicPlanLookup(question, context)
    ?? deterministicTodayStep(question, context)
    ?? deterministicJourneyPattern(question, context);
  if (deterministic) {
    return {
      ...deterministic,
      diagnostics: {
        intent: context.intent,
        qualityScore: 100,
        safetyRuleCount: context.preSafety?.findings.length ?? 0,
        recommendationsRemoved: 0,
        regenerationCount: 0,
        evidenceIds: context.evidenceOptions.map((option) => option.id),
      } satisfies CoachDiagnostics,
    };
  }

  const validSourceIds = new Set(context.sources.map((source) => source.id));
  const allowedNames = new Set(context.evidenceOptions.map((option) => option.name.toLowerCase()));
  const isSupplementQuestion = supplementQuestion(question, context);
  let regenerationCount = 0;
  let proposal: StructuredCoachAnswer | null = null;
  let generatedByModel = false;
  for (let attempt = 0; attempt < 2 && !proposal; attempt += 1) {
    try {
      const response = await generateAI({
        task: "contextual_coach",
        userId,
        messages: prompt(question, context, attempt > 0),
        maxTokens: 650,
        timeoutMs: 20_000,
        temperature: 0.2,
      });
      proposal = parseStructuredCoachAnswer(response.text, context.intent, validSourceIds, allowedNames);
      if (proposal) generatedByModel = true;
      if (!proposal && attempt === 0) regenerationCount = 1;
    } catch (error) {
      console.warn("[coach.v2] model unavailable; using deterministic evidence repair", error);
      break;
    }
  }
  proposal ??= fallbackStructured(question, context);
  let validated = await postValidate(context, proposal);
  let rendered = renderAnswer(validated.answer, context, validated.safety);
  let quality: CoachQualityReport = assessCoachAnswerQuality({
    answer: validated.answer,
    supplementQuestion: isSupplementQuestion,
    safetyChecked: !isSupplementQuestion || Boolean(validated.safety?.complete),
    usedMemberContext: context.intent !== "GENERAL_EDUCATION",
    allCandidatesBlocked: Boolean(context.preSafety?.candidates.length && context.preSafety.candidates.every((candidate) => candidate.decision === "blocked")),
  });
  if (!quality.passed) {
    regenerationCount = Math.max(regenerationCount, 1);
    validated = await postValidate(context, fallbackStructured(question, context));
    rendered = renderAnswer(validated.answer, context, validated.safety);
    quality = assessCoachAnswerQuality({
      answer: validated.answer,
      supplementQuestion: isSupplementQuestion,
      safetyChecked: !isSupplementQuestion || Boolean(validated.safety?.complete),
      usedMemberContext: context.intent !== "GENERAL_EDUCATION",
      allCandidatesBlocked: Boolean(context.preSafety?.candidates.length && context.preSafety.candidates.every((candidate) => candidate.decision === "blocked")),
    });
  }
  const evidenceIds = validated.answer.options
    .map((option) => evidenceOptionByName(context.evidenceOptions, option.name)?.id)
    .filter((id): id is string => Boolean(id));
  const sourceIds = [...new Set([
    ...validated.answer.sourceIds,
    ...evidenceIds,
    ...(validated.safety?.findings.length && validSourceIds.has("current_routine") ? ["current_routine"] : []),
    ...(validated.safety?.findings.length && validSourceIds.has("health_profile") ? ["health_profile"] : []),
  ])].filter((id) => validSourceIds.has(id));
  return {
    answer: rendered,
    sourceIds,
    responseSource: generatedByModel ? "ai" as const : "fallback" as const,
    diagnostics: {
      intent: context.intent,
      qualityScore: quality.score,
      safetyRuleCount: validated.safety?.findings.length ?? 0,
      recommendationsRemoved: validated.removed,
      regenerationCount,
      evidenceIds,
    } satisfies CoachDiagnostics,
  };
}
