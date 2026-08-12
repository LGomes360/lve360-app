import "server-only";

import { identityLabel, type WeeklyExperiment } from "@/lib/activation";
import { generateAI } from "@/lib/ai/gateway";
import { getCurrentBlueprintContext } from "@/lib/currentBlueprintContext";
import { getCurrentRegimen } from "@/lib/currentRegimen";
import type { CoachPage, CoachSource } from "@/lib/contextualCoach";
import { parseCoachAnswer } from "@/lib/contextualCoach";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export type CoachContext = {
  page: CoachPage;
  sources: CoachSource[];
  facts: Record<string, unknown>;
};

const PAGE_SOURCE_IDS: Record<CoachPage, string[]> = {
  today: ["weekly_practice", "current_blueprint", "recent_check_ins"],
  routine: ["current_routine"],
  blueprint: ["current_blueprint", "current_routine"],
  journey: ["weekly_practice", "recent_check_ins"],
  review: ["weekly_practice", "recent_check_ins", "current_blueprint"],
  settings: ["current_blueprint", "current_routine", "weekly_practice", "recent_check_ins"],
  other: ["current_blueprint", "current_routine", "weekly_practice", "recent_check_ins"],
};

const FACT_KEY_BY_SOURCE: Record<string, string> = {
  current_blueprint: "blueprint",
  current_routine: "routine",
  weekly_practice: "weekly_practice",
  recent_check_ins: "recent_check_ins",
};

function scopeContext(page: CoachPage, sources: CoachSource[], facts: Record<string, unknown>): CoachContext {
  const allowed = new Set(PAGE_SOURCE_IDS[page]);
  const scopedSources = sources.filter((source) => allowed.has(source.id));
  const scopedFacts = Object.fromEntries(scopedSources.flatMap((source) => {
    const key = FACT_KEY_BY_SOURCE[source.id];
    return key && key in facts ? [[key, facts[key]]] : [];
  }));
  return { page, sources: scopedSources, facts: scopedFacts };
}

function compact(value: string | null | undefined, length = 160) {
  return value?.replace(/\s+/g, " ").trim().slice(0, length) || null;
}

export async function buildCoachContext(userId: string, page: CoachPage): Promise<CoachContext> {
  const admin = getSupabaseAdmin();
  const [blueprint, regimen, experimentResult, checkInsResult] = await Promise.all([
    getCurrentBlueprintContext(userId),
    getCurrentRegimen(userId),
    admin.from("weekly_experiments")
      .select("id,identity_direction,action_label,cue,frequency_per_week,minimum_version,week_start,status")
      .eq("user_id", userId).eq("status", "active").order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    admin.from("logs").select("log_date,weight,sleep,energy")
      .eq("user_id", userId).order("log_date", { ascending: false }).limit(7),
  ]);
  if (experimentResult.error) throw experimentResult.error;
  if (checkInsResult.error) throw checkInsResult.error;

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
    sources.push({
      id: "current_routine",
      label: "Current Routine",
      summary: `${regimen.length} active medication, hormone, and supplement records.`,
      href: "/routine",
    });
    facts.routine = regimen.slice(0, 30).map((item) => ({
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
    const { count, error } = await admin.from("daily_practice_completions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId).eq("experiment_id", experiment.id);
    if (error) throw error;
    sources.push({
      id: "weekly_practice",
      label: "Weekly Practice",
      summary: `${count ?? 0} completions recorded toward this week's ${experiment.frequency_per_week ?? 0}-day target.`,
      href: "/today",
    });
    facts.weekly_practice = {
      identity: identityLabel(experiment.identity_direction ?? null),
      action: compact(experiment.action_label),
      cue: compact(experiment.cue),
      minimum_version: compact(experiment.minimum_version),
      target: experiment.frequency_per_week,
      completions: count ?? 0,
      week_start: experiment.week_start,
    };
  }
  if ((checkInsResult.data ?? []).length) {
    const checkIns = checkInsResult.data ?? [];
    sources.push({
      id: "recent_check_ins",
      label: "Recent check-ins",
      summary: `${checkIns.length} recent weight, sleep, or energy entries.`,
      href: "/journey",
    });
    facts.recent_check_ins = checkIns.map((item) => ({
      date: item.log_date,
      weight: item.weight,
      sleep_rating_out_of_5: item.sleep,
      energy_rating_out_of_10: item.energy,
    }));
  }
  return scopeContext(page, sources, facts);
}

function prompt(question: string, context: CoachContext) {
  return [
    {
      role: "system" as const,
      content: [
        "You are Ask LVE360, a concise lifestyle coach for longevity, vitality, energy, and happiness.",
        "Use only the supplied member facts. Never invent a fact, diagnosis, symptom, causal claim, interaction, contraindication, or evidence finding.",
        "You may help with small lifestyle actions, reflection, organization, adherence, and questions to discuss with a qualified professional.",
        "Never tell the member to start, stop, add, remove, change, or dose a medication, hormone, or supplement. Never diagnose or claim to treat, cure, prevent, or manage disease.",
        "Do not add health benefits, mechanisms, or expected outcomes. Explain choices only through the supplied record, feasibility, consistency, or the member's explicit weekly target.",
        "Do not call something the member's goal unless an explicit goal is present in the supplied facts.",
        "Stay within the supplied context for the current page. Do not pull in or imply information from another dashboard area.",
        "A sleep rating is a score out of 5, not hours slept. An energy rating is a score out of 10.",
        "If the records do not support an answer, say what is missing and point to the relevant record to review.",
        "Use supportive plain language and no shame. Keep the answer under 180 words.",
        "Return only valid JSON with fields answer (string) and source_ids (array of source id strings). Include every source used for a personalized claim.",
      ].join(" "),
    },
    { role: "user" as const, content: JSON.stringify({ question, current_page: context.page, available_sources: context.sources, member_facts: context.facts }) },
  ];
}

function deterministicTodayStep(question: string, context: CoachContext) {
  if (context.page !== "today" || !/\b(?:smallest|next|today|right now)\b/i.test(question)) return null;
  const practice = context.facts.weekly_practice as {
    action?: unknown;
    minimum_version?: unknown;
  } | undefined;
  const action = typeof practice?.action === "string" ? practice.action : null;
  const minimum = typeof practice?.minimum_version === "string" ? practice.minimum_version : null;
  if (!action || !minimum) return null;
  return {
    answer: `Use the minimum version of your current weekly practice: ${minimum}. That is the smallest version you already chose for your active practice: ${action} Completing it keeps today's decision tied to your active plan without adding another task.`,
    sourceIds: ["weekly_practice"],
    responseSource: "deterministic" as const,
  };
}

function deterministicRoutineOverview(question: string, context: CoachContext) {
  if (context.page !== "routine" || !/\b(?:recorded routine|routine fits|routine fit|routine work together)\b/i.test(question)) return null;
  const items = Array.isArray(context.facts.routine) ? context.facts.routine as Array<Record<string, unknown>> : [];
  if (!items.length) return null;
  const counts = items.reduce<{ medications: number; hormones: number; supplements: number; withTiming: number }>((result, item) => {
    const kind = String(item.kind ?? "");
    if (kind === "medication") result.medications += 1;
    else if (kind === "hormone") result.hormones += 1;
    else result.supplements += 1;
    if (typeof item.timing === "string" && item.timing.trim()) result.withTiming += 1;
    return result;
  }, { medications: 0, hormones: 0, supplements: 0, withTiming: 0 });
  return {
    answer: `Your current Routine records ${counts.medications} medication${counts.medications === 1 ? "" : "s"}, ${counts.hormones} hormone${counts.hormones === 1 ? "" : "s"}, and ${counts.supplements} supplement${counts.supplements === 1 ? "" : "s"}. ${counts.withTiming} of those records include timing details. LVE360 is organizing the schedule you entered, not deciding whether the items are safe together. The most useful review is to confirm each name, dose, and timing against your current clinician or pharmacist instructions.`,
    sourceIds: ["current_routine"],
    responseSource: "deterministic" as const,
  };
}

export async function generateCoachAnswer(userId: string, question: string, context: CoachContext) {
  const deterministic = deterministicTodayStep(question, context) ?? deterministicRoutineOverview(question, context);
  if (deterministic) return deterministic;
  const response = await generateAI({
    task: "contextual_coach",
    userId,
    messages: prompt(question, context),
    maxTokens: 350,
    timeoutMs: 20_000,
    temperature: 0.2,
  });
  const parsed = parseCoachAnswer(response.text, new Set(context.sources.map((source) => source.id)));
  if (parsed && /\byour goal\b/i.test(parsed.answer) && !("goals" in context.facts)) return null;
  return parsed ? { ...parsed, responseSource: "ai" as const } : null;
}
