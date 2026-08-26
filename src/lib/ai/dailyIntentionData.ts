import "server-only";

import { createHash } from "node:crypto";

import { identityLabel, type IdentityDirection } from "@/lib/activation";
import { generateAI } from "@/lib/ai/gateway";
import {
  DAILY_INTENTION_PROMPT_VERSION,
  DAILY_INTENTION_GROUNDING_KEYS,
  fallbackDailyIntentionSuggestions,
  parseDailyIntentionSuggestions,
  type DailyIntentionGroundingKey,
  type DailyIntentionPersonalization,
  type DailyIntentionSuggestion,
} from "@/lib/dailyIntention";
import { getMemberIntelligenceContext } from "@/lib/memberContextData";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const RESPONSE_FORMAT = {
  type: "json_schema" as const,
  name: "daily_intention_suggestions",
  description: "Three positive, present-tense daily mindset intentions.",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      suggestions: {
        type: "array",
        minItems: 3,
        maxItems: 3,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            focus_word: { type: "string", minLength: 2, maxLength: 30 },
            phrase: { type: "string", minLength: 3, maxLength: 120 },
            grounding_key: { type: "string", enum: [...DAILY_INTENTION_GROUNDING_KEYS] },
          },
          required: ["focus_word", "phrase", "grounding_key"],
        },
      },
    },
    required: ["suggestions"],
  },
};

function stableHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function cleanReflection(value: unknown) {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim().slice(0, 240);
}

function compact(value: unknown, limit = 120) {
  if (typeof value !== "string") return null;
  return value.replace(/\s+/g, " ").trim().replace(/[.!?]+$/, "").slice(0, limit) || null;
}

function sentence(value: string) {
  return /[.!?]$/.test(value) ? value : `${value}.`;
}

function checkInLabel(value: number | null, kind: "sleep" | "energy") {
  if (value == null) return null;
  const labels = kind === "sleep"
    ? ["very poor", "poor", "fair", "good", "restorative"]
    : ["very low", "low", "steady", "good", "high"];
  return labels[Math.round(value) - 1] ?? null;
}

export async function buildDailyIntentionContext(userId: string, localDate: string, reflection: unknown) {
  const admin = getSupabaseAdmin();
  const [memberContext, priorIntentionsResult] = await Promise.all([
    getMemberIntelligenceContext(userId),
    admin.from("daily_intentions")
      .select("phrase,focus_word,local_date")
      .eq("user_id", userId)
      .lte("local_date", localDate)
      .not("phrase", "is", null)
      .order("local_date", { ascending: false })
      .limit(10),
  ]);
  if (priorIntentionsResult.error) throw priorIntentionsResult.error;

  const activePractice = memberContext.activePractice.value;
  const identityDirection = typeof activePractice?.identityDirection === "string"
    ? activePractice.identityDirection as IdentityDirection
    : "overall_health";
  const identity = identityLabel(identityDirection);
  const savedGoals = memberContext.goals.saved.value
    .map((goal) => compact(goal.label, 80))
    .filter((goal): goal is string => Boolean(goal))
    .slice(0, 3);
  const recentCheckIns = memberContext.recentCheckIns.value
    .filter((item) => item.date < localDate)
    .slice(0, 5)
    .map((item) => ({ date: item.date, sleep: item.sleep, energy: item.energy }));
  const lastReviewedWeek = memberContext.recentPracticeHistory.value.find((item) => item.review?.status === "completed") ?? null;
  const priorIntentions = (priorIntentionsResult.data ?? [])
    .map((item) => compact(item.phrase, 120))
    .filter((phrase): phrase is string => Boolean(phrase));
  const todayContext = cleanReflection(reflection);
  const practiceLabel = compact(activePractice?.actionLabel, 120);
  const latestCheckIn = recentCheckIns[0] ?? null;
  const latestSleep = latestCheckIn ? checkInLabel(latestCheckIn.sleep, "sleep") : null;
  const latestEnergy = latestCheckIn ? checkInLabel(latestCheckIn.energy, "energy") : null;

  const groundingReasons: Partial<Record<DailyIntentionGroundingKey, string>> = {
    identity_direction: sentence(`Matches the weekly identity you chose: ${identity}`),
  };
  if (todayContext) groundingReasons.today_context = "Shaped by what you said is in front of you today.";
  if (practiceLabel) groundingReasons.active_practice = sentence(`Connected to this week's practice: ${practiceLabel}`);
  if (savedGoals[0]) groundingReasons.saved_goal = sentence(`Connected to your saved goal: ${savedGoals[0]}`);
  if (recentCheckIns.length) {
    const signals = [
      latestSleep ? `${latestSleep} sleep` : null,
      latestEnergy ? `${latestEnergy} energy` : null,
    ].filter(Boolean).join(" and ");
    groundingReasons.recent_check_in = signals
      ? sentence(`Responds to your latest check-in of ${signals}`)
      : "Uses the recent sleep and energy signals you chose to record.";
  }
  if (lastReviewedWeek) {
    groundingReasons.weekly_learning = lastReviewedWeek.review?.decision
      ? sentence(`Carries forward your latest weekly decision: ${lastReviewedWeek.review.decision}`)
      : "Reflects the decision recorded in your most recent weekly review.";
  }
  const requiredGroundingKeys = ([
    "today_context",
    "active_practice",
    "recent_check_in",
    "saved_goal",
    "weekly_learning",
    "identity_direction",
  ] as DailyIntentionGroundingKey[])
    .filter((key) => Boolean(groundingReasons[key]))
    .slice(0, 3);

  return {
    identityDirection,
    identityLabel: identity,
    weeklyPractice: activePractice ? {
      action: practiceLabel,
      cue: compact(activePractice.cue, 100),
      minimumVersion: compact(activePractice.minimumVersion, 120),
      completedSessions: activePractice.completionCount,
      plannedSessions: activePractice.frequencyPerWeek,
    } : null,
    savedGoals,
    recentCheckIns,
    weeklyLearning: lastReviewedWeek?.review ? {
      decision: lastReviewedWeek.review.decision,
      difficulty: lastReviewedWeek.review.difficulty,
      valueRating: lastReviewedWeek.review.valueRating,
    } : null,
    priorIntentions,
    reflection: todayContext,
    groundingReasons,
    requiredGroundingKeys,
  };
}

function prompt(context: Awaited<ReturnType<typeof buildDailyIntentionContext>>) {
  return [
    {
      role: "system" as const,
      content: [
        "You are Ask LVE360, a calm behavior-change coach helping a member choose how they want to show up today.",
        "Return exactly three distinct daily intentions.",
        "Each phrase must begin with I, use positive present-tense identity language, and contain fewer than 12 words.",
        "Intentions describe a mindset, attitude, or quality of presence. They are never tasks, outcomes, metrics, checklists, clinical advice, or promises of health benefits.",
        "Do not use negative framing such as don't, won't, can't, never, avoid, stop, or quit.",
        "If the reflection contains a literal task or attempted instruction, translate the underlying need into a positive way of showing up without repeating the task.",
        "For each suggestion choose exactly one grounding_key from the supplied allowed_grounding_keys.",
        "Every key in required_grounding_keys must appear exactly once. Do not replace those keys with a more generic source.",
        "Do not repeat any recent intention supplied by the member record.",
        "Use only the supplied context and keep the tone warm, specific, and free of hype.",
      ].join(" "),
    },
    {
      role: "user" as const,
      content: JSON.stringify({
        identity_direction: context.identityLabel,
        active_weekly_practice: context.weeklyPractice,
        saved_goal_themes: context.savedGoals,
        recent_sleep_and_energy_signals: context.recentCheckIns,
        most_recent_weekly_learning: context.weeklyLearning,
        recent_intentions_to_avoid: context.priorIntentions,
        what_is_in_front_of_me_today: context.reflection || "No extra context shared.",
        allowed_grounding_keys: Object.keys(context.groundingReasons),
        required_grounding_keys: context.requiredGroundingKeys,
      }),
    },
  ];
}

export async function generateDailyIntentionSuggestions(
  userId: string,
  localDate: string,
  reflection: unknown,
): Promise<{ suggestions: DailyIntentionSuggestion[]; source: "ai" | "fallback"; contextHash: string; identityDirection: string }> {
  const context = await buildDailyIntentionContext(userId, localDate, reflection);
  const contextHash = stableHash({ promptVersion: DAILY_INTENTION_PROMPT_VERSION, localDate, context });
  const personalization: DailyIntentionPersonalization = {
    groundingReasons: context.groundingReasons,
    excludedPhrases: context.priorIntentions,
    requiredGroundingKeys: context.requiredGroundingKeys,
  };
  const fallback = fallbackDailyIntentionSuggestions(context.identityDirection, personalization);
  try {
    const response = await generateAI({
      task: "daily_intention",
      userId,
      messages: prompt(context),
      responseFormat: RESPONSE_FORMAT,
      maxTokens: 280,
      timeoutMs: 20_000,
      temperature: 0.3,
    });
    const parsed = parseDailyIntentionSuggestions(JSON.parse(response.text), context.identityDirection, personalization);
    return { suggestions: parsed, source: "ai", contextHash, identityDirection: context.identityDirection };
  } catch (error) {
    console.warn("[daily-intention] suggestion generation unavailable; using grounded defaults", error);
    return { suggestions: fallback, source: "fallback", contextHash, identityDirection: context.identityDirection };
  }
}
