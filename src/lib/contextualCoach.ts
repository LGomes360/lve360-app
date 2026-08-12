export const COACH_PROMPT_VERSION = "contextual-coach-v1";

export type CoachPage = "today" | "routine" | "blueprint" | "journey" | "review" | "settings" | "other";
export type CoachFeedback = "useful" | "not_useful";

export type CoachSource = {
  id: string;
  label: string;
  summary: string;
  href: string;
};

export type CoachTurn = {
  id: string;
  page_context: CoachPage;
  question: string;
  answer: string;
  response_source: "ai" | "fallback" | "safety" | "budget";
  generation_status: "pending" | "succeeded" | "failed" | "blocked" | "limited";
  source_refs: CoachSource[];
  feedback: CoachFeedback | null;
  created_at: string;
};

const PAGE_MAP: Array<[RegExp, CoachPage]> = [
  [/^\/today(?:\/|$)/, "today"],
  [/^\/routine(?:\/|$)/, "routine"],
  [/^\/blueprints?(?:\/|$)/, "blueprint"],
  [/^\/journey(?:\/|$)/, "journey"],
  [/^\/review(?:\/|$)/, "review"],
  [/^\/(?:settings|account)(?:\/|$)/, "settings"],
];

export function coachPageFromPath(value: unknown): CoachPage {
  if (typeof value !== "string") return "other";
  return PAGE_MAP.find(([pattern]) => pattern.test(value))?.[1] ?? "other";
}

export function cleanCoachQuestion(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/\s+/g, " ").trim().slice(0, 500);
  return cleaned.length >= 4 ? cleaned : null;
}

export function isCoachFeedback(value: unknown): value is CoachFeedback {
  return value === "useful" || value === "not_useful";
}

export type CoachSafetyBoundary = "emergency" | "diagnosis" | "regimen_change" | null;

export function coachSafetyBoundary(question: string): CoachSafetyBoundary {
  const value = question.toLowerCase();
  if (/\b(suicid|kill myself|overdose|chest pain|can't breathe|cannot breathe|stroke|medical emergency)\b/.test(value)) {
    return "emergency";
  }
  if (/\b(diagnose|diagnosis|what disease|what condition|is this cancer|do i have (?:a disease|a condition|cancer|diabetes|depression|anxiety|hypertension))\b/.test(value)) {
    return "diagnosis";
  }
  const change = /\b(start|begin|stop|quit|add|remove|increase|decrease|double|halve|change|adjust|skip|replace|switch|take|use)\b/;
  const healthItem = /\b(medication|medicine|prescription|dose|dosage|hormone|supplement|vitamin|b\s?12|magnesium|creatine|melatonin|omega-?3|zepbound|insulin|thyroid)\b/;
  return change.test(value) && healthItem.test(value) ? "regimen_change" : null;
}

export function coachBoundaryAnswer(boundary: Exclude<CoachSafetyBoundary, null>): string {
  if (boundary === "emergency") {
    return "This may need immediate human help. If you may be in danger or have severe symptoms, call emergency services now. In the U.S., call 911. For a mental-health crisis, call or text 988. LVE360 cannot assess an emergency.";
  }
  if (boundary === "diagnosis") {
    return "I can help you organize your recorded information and prepare questions for a qualified clinician, but I cannot diagnose a condition. If you describe what you want to understand, I can help you create a concise discussion list.";
  }
  return "I cannot tell you to start, stop, or change a medication, hormone, supplement, or dose. I can summarize what LVE360 currently records and help you prepare specific questions for your clinician or pharmacist before making a change.";
}

export function parseCoachAnswer(text: string, validSourceIds: Set<string>) {
  const candidate = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    const value = JSON.parse(candidate) as { answer?: unknown; source_ids?: unknown };
    if (typeof value.answer !== "string" || value.answer.trim().length < 2 || value.answer.length > 4000) return null;
    if (!isCoachAnswerSafe(value.answer)) return null;
    const ids = Array.isArray(value.source_ids)
      ? [...new Set(value.source_ids.filter((id): id is string => typeof id === "string" && validSourceIds.has(id)))]
      : [];
    return { answer: value.answer.trim(), sourceIds: ids };
  } catch {
    return null;
  }
}

export function isCoachAnswerSafe(answer: string) {
  const value = answer.toLowerCase();
  if (/\b(you have|this is|you are suffering from)\s+(?:a\s+)?(?:disease|condition|cancer|diabetes|depression|anxiety|hypertension)\b/.test(value)) return false;
  const directive = /\b(?:you should|i recommend|go ahead and|please)\s+(?:start|begin|stop|quit|add|remove|increase|decrease|double|halve|change|adjust|skip|replace|switch|take|use)\b/;
  const healthItem = /\b(medication|medicine|prescription|dose|dosage|hormone|supplement|vitamin|b\s?12|magnesium|creatine|melatonin|omega-?3|zepbound|insulin|thyroid)\b/;
  if (directive.test(value) && healthItem.test(value)) return false;
  const benefitClaim = /\b(?:can|may|might|could|will|helps?|supports?|aimed at)\s+(?:help\s+|benefit from\s+)?(?:improve|boost|reduce|lower|increase|prevent|support|supporting|enhance|adjustments?|changes?)\b/;
  const healthOutcome = /\b(?:digestion|energy levels?|sleep quality|blood pressure|blood sugar|weight loss|mood|cognition|memory|symptoms?|inflammation|disease|longevity)\b/;
  return !(benefitClaim.test(value) && healthOutcome.test(value));
}

export function coachSuggestedPrompts(page: CoachPage): string[] {
  const common = "What is the smallest useful step I can take today?";
  const prompts: Record<CoachPage, string[]> = {
    today: [common, "How can I make today's weekly practice easier to complete?"],
    routine: ["Help me understand how my recorded routine fits together.", "What should I prepare to discuss with my clinician or pharmacist?"],
    blueprint: ["What are the most important themes in my current Blueprint?", "How can I turn one Blueprint priority into a small weekly practice?"],
    journey: ["What pattern can I cautiously learn from my recent progress?", "What small win should I build on next?"],
    review: ["Help me reflect on what made this week easier or harder.", "What is a sensible experiment for next week?"],
    settings: ["Which information should I review so LVE360 stays useful?", common],
    other: [common, "What information in LVE360 should I review first?"],
  };
  return prompts[page];
}
