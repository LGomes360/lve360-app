import "server-only";

import { identityLabel, type WeeklyExperiment } from "@/lib/activation";
import { generateAI } from "@/lib/ai/gateway";
import { getCurrentBlueprintContext } from "@/lib/currentBlueprintContext";
import { getCurrentRegimen } from "@/lib/currentRegimen";
import type { CoachPage, CoachSource } from "@/lib/contextualCoach";
import { parseCoachAnswer } from "@/lib/contextualCoach";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

type CoachContext = {
  page: CoachPage;
  sources: CoachSource[];
  facts: Record<string, unknown>;
};

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
    facts.recent_check_ins = checkIns;
  }
  return { page, sources, facts };
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
        "If the records do not support an answer, say what is missing and point to the relevant record to review.",
        "Use supportive plain language and no shame. Keep the answer under 180 words.",
        "Return only valid JSON with fields answer (string) and source_ids (array of source id strings). Include every source used for a personalized claim.",
      ].join(" "),
    },
    { role: "user" as const, content: JSON.stringify({ question, current_page: context.page, available_sources: context.sources, member_facts: context.facts }) },
  ];
}

export async function generateCoachAnswer(userId: string, question: string, context: CoachContext) {
  const response = await generateAI({
    task: "contextual_coach",
    userId,
    messages: prompt(question, context),
    maxTokens: 350,
    timeoutMs: 20_000,
    temperature: 0.2,
  });
  return parseCoachAnswer(response.text, new Set(context.sources.map((source) => source.id)));
}
