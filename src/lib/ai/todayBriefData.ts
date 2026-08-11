import "server-only";

import { createHash } from "node:crypto";

import { identityLabel, type WeeklyExperiment } from "@/lib/activation";
import { generateAI } from "@/lib/ai/gateway";
import { getCurrentBlueprintContext } from "@/lib/currentBlueprintContext";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { completionCount, weekBounds, type DailyPracticeCompletion } from "@/lib/today";
import {
  deterministicTodayBrief,
  parseGeneratedTodayBrief,
  shouldGenerateTodayBrief,
  TODAY_BRIEF_PROMPT_VERSION,
  type TodayBriefContent,
  type TodayBriefContext,
} from "@/lib/todayBrief";
import { isReviewDue } from "@/lib/weeklyReview";

type TodayBriefRow = {
  id: string;
  local_date: string;
  context_hash: string;
  prompt_version: string;
  source: "ai" | "fallback";
  generation_status: "pending" | "succeeded" | "failed" | "skipped";
  noticed: string;
  why_it_matters: string;
  next_action: string;
  minimum_version: string;
  primary_action: TodayBriefContent["primaryAction"];
  primary_href: string | null;
  feedback: "useful" | "not_useful" | null;
  action_state: "none" | "completed" | "remind_later" | "opened_routine" | "dismissed";
  remind_after: string | null;
};

export type TodayBrief = TodayBriefContent & {
  id: string;
  localDate: string;
  source: "ai" | "fallback";
  feedback: "useful" | "not_useful" | null;
  actionState: TodayBriefRow["action_state"];
  hidden: boolean;
};

function stableHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function rowToBrief(row: TodayBriefRow, now = new Date()): TodayBrief {
  const snoozed = row.action_state === "remind_later"
    && Boolean(row.remind_after)
    && new Date(row.remind_after as string).getTime() > now.getTime();
  return {
    id: row.id,
    localDate: row.local_date,
    source: row.source,
    noticed: row.noticed,
    whyItMatters: row.why_it_matters,
    nextAction: row.next_action,
    minimumVersion: row.minimum_version,
    primaryAction: row.primary_action,
    primaryHref: row.primary_href,
    feedback: row.feedback,
    actionState: row.action_state,
    hidden: snoozed || row.action_state === "dismissed",
  };
}

async function activeExperiment(userId: string): Promise<WeeklyExperiment | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("weekly_experiments")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as WeeklyExperiment | null) ?? null;
}

export async function buildTodayBriefContext(userId: string, localDate: string): Promise<TodayBriefContext> {
  const [experiment, blueprint] = await Promise.all([
    activeExperiment(userId),
    getCurrentBlueprintContext(userId),
  ]);

  let completions: DailyPracticeCompletion[] = [];
  if (experiment) {
    const bounds = weekBounds(experiment.week_start);
    const { data, error } = await getSupabaseAdmin()
      .from("daily_practice_completions")
      .select("completion_date,completion_kind")
      .eq("user_id", userId)
      .eq("experiment_id", experiment.id)
      .gte("completion_date", bounds.start)
      .lte("completion_date", bounds.end)
      .order("completion_date", { ascending: true });
    if (error) throw error;
    completions = (data ?? []) as DailyPracticeCompletion[];
  }

  return {
    localDate,
    experiment: experiment ? {
      id: experiment.id,
      identity: identityLabel(experiment.identity_direction),
      actionLabel: experiment.action_label ?? "Complete today’s focused practice",
      cue: experiment.cue ?? "your planned cue appears",
      minimumVersion: experiment.minimum_version ?? "Take the first small step",
      target: experiment.frequency_per_week ?? 1,
      completed: completionCount(completions),
      completedToday: completions.some((item) => item.completion_date === localDate),
    } : null,
    blueprint: blueprint ? {
      stackId: blueprint.stack_id,
      needsRefresh: blueprint.needs_refresh,
      safetyNeedsAttention: blueprint.safety_status !== "safe" && !blueprint.safety_acknowledged,
    } : null,
    reviewDue: Boolean(experiment && isReviewDue(experiment.week_start, localDate)),
  };
}

function generatedPrompt(context: TodayBriefContext) {
  const experiment = context.experiment;
  if (!experiment) return [];
  return [
    {
      role: "system" as const,
      content: [
        "You write one short daily lifestyle-coaching brief for LVE360.",
        "Use only the supplied weekly practice. Do not introduce supplements, nutrients, medications, diagnoses, tests, treatments, doses, or new health facts.",
        "Do not claim causation or guaranteed outcomes. Keep the tone direct, calm, specific, and encouraging without hype.",
        "Return only valid JSON with exactly these string fields: noticed, why_it_matters, next_action, minimum_version.",
        "noticed must describe a real pattern in the supplied progress. next_action must stay faithful to the saved practice. minimum_version must stay faithful to the saved minimum version.",
      ].join(" "),
    },
    {
      role: "user" as const,
      content: JSON.stringify({
        local_date: context.localDate,
        identity_direction: experiment.identity,
        saved_practice: experiment.actionLabel,
        saved_cue: experiment.cue,
        saved_minimum_version: experiment.minimumVersion,
        weekly_target: experiment.target,
        weekly_completions: experiment.completed,
      }),
    },
  ];
}

function rowValues(
  userId: string,
  localDate: string,
  contextHash: string,
  content: TodayBriefContent,
) {
  return {
    user_id: userId,
    local_date: localDate,
    context_hash: contextHash,
    prompt_version: TODAY_BRIEF_PROMPT_VERSION,
    source: "fallback",
    generation_status: "pending",
    noticed: content.noticed,
    why_it_matters: content.whyItMatters,
    next_action: content.nextAction,
    minimum_version: content.minimumVersion,
    primary_action: content.primaryAction,
    primary_href: content.primaryHref,
  };
}

export async function getOrCreateTodayBrief(userId: string, localDate: string): Promise<TodayBrief> {
  const admin = getSupabaseAdmin();
  const context = await buildTodayBriefContext(userId, localDate);
  const contextHash = stableHash({ promptVersion: TODAY_BRIEF_PROMPT_VERSION, context });

  const { data: existing, error: existingError } = await admin
    .from("ai_today_briefs")
    .select("*")
    .eq("user_id", userId)
    .eq("local_date", localDate)
    .eq("context_hash", contextHash)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) return rowToBrief(existing as TodayBriefRow);

  const fallback = deterministicTodayBrief(context);
  const { data: claimed, error: claimError } = await admin
    .from("ai_today_briefs")
    .insert(rowValues(userId, localDate, contextHash, fallback))
    .select("*")
    .single();

  if (claimError?.code === "23505") {
    const { data: raced, error: racedError } = await admin
      .from("ai_today_briefs")
      .select("*")
      .eq("user_id", userId)
      .eq("local_date", localDate)
      .eq("context_hash", contextHash)
      .single();
    if (racedError) throw racedError;
    return rowToBrief(raced as TodayBriefRow);
  }
  if (claimError || !claimed) throw claimError ?? new Error("today_brief_claim_failed");

  if (!shouldGenerateTodayBrief(context)) {
    const { data, error } = await admin
      .from("ai_today_briefs")
      .update({ generation_status: "skipped", updated_at: new Date().toISOString() })
      .eq("id", claimed.id)
      .select("*")
      .single();
    if (error) throw error;
    return rowToBrief(data as TodayBriefRow);
  }

  try {
    const response = await generateAI({
      task: "today_brief",
      userId,
      messages: generatedPrompt(context),
      maxTokens: 240,
      timeoutMs: 20_000,
      temperature: 0.2,
    });
    const generated = parseGeneratedTodayBrief(response.text, context);
    const content = generated ?? fallback;
    const { data, error } = await admin
      .from("ai_today_briefs")
      .update({
        source: generated ? "ai" : "fallback",
        generation_status: generated ? "succeeded" : "failed",
        noticed: content.noticed,
        why_it_matters: content.whyItMatters,
        next_action: content.nextAction,
        minimum_version: content.minimumVersion,
        primary_action: content.primaryAction,
        primary_href: content.primaryHref,
        updated_at: new Date().toISOString(),
      })
      .eq("id", claimed.id)
      .select("*")
      .single();
    if (error) throw error;
    return rowToBrief(data as TodayBriefRow);
  } catch (error) {
    console.warn("[today-brief] generation unavailable; using saved fallback", error);
    const { data, error: updateError } = await admin
      .from("ai_today_briefs")
      .update({ generation_status: "failed", updated_at: new Date().toISOString() })
      .eq("id", claimed.id)
      .select("*")
      .single();
    if (updateError) throw updateError;
    return rowToBrief(data as TodayBriefRow);
  }
}
