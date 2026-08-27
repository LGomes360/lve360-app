import type { CoachIntent, CoachPage } from "./contextualCoach.ts";
import { requestsMemberReportedContext } from "./memberReportedContext.ts";
import { isUsableMinimumVersionText } from "./practiceQuantity.ts";

export type GroundedCoachFallbackInput = {
  question: string;
  intent: CoachIntent;
  page: CoachPage;
  availableSourceIds: string[];
  missingContextLabels: string[];
  routineCount: number;
  evidenceOptions: Array<{ id: string; name: string }>;
  activePractice: {
    actionLabel: string | null;
    minimumVersion: string | null;
    completionCount: number;
    frequencyPerWeek: number | null;
    knownTotalQuantity: number | null;
    totalQuantityUnit: string | null;
  } | null;
  blueprintPriorities: string[];
  memberReportedContexts: string[];
};

export type GroundedCoachFallback = {
  answer: string;
  sourceIds: string[];
};

const REGIMEN_INTENTS = new Set<CoachIntent>([
  "CURRENT_REGIMEN_LOOKUP",
  "MEDICATION_LOOKUP",
  "HORMONE_LOOKUP",
  "SUPPLEMENT_LOOKUP",
  "CURRENT_PLAN_LOOKUP",
  "REQUEST_TO_CHANGE_RECORD",
]);

const EVIDENCE_INTENTS = new Set<CoachIntent>([
  "GENERAL_EDUCATION",
  "PERSONALIZED_RECOMMENDATION",
  "EVIDENCE_COMPARISON",
  "OPTION_COMPARISON",
  "TIMING_OR_DOSING",
]);

function uniqueAvailable(ids: string[], available: Set<string>) {
  return [...new Set(ids)].filter((id) => available.has(id));
}

function sentenceFragment(value: string) {
  return value.trim().replace(/[.!?]+$/, "");
}

function memberContextFallback(input: GroundedCoachFallbackInput): GroundedCoachFallback | null {
  if (!requestsMemberReportedContext(input.question)) return null;
  const note = input.memberReportedContexts.find((value) => value.trim())?.trim();
  if (!note || !input.availableSourceIds.includes("recent_check_ins")) return null;
  const noteNamesHelpfulExperience = /\b(?:helped|worked|felt better|made .{0,30} easier)\b/i.test(note);
  const experiment = noteNamesHelpfulExperience
    ? "One small way to protect what worked is to repeat the smallest practical version of the helpful behavior your note names before the next busy part of your day."
    : "Use this observation for one small experiment: make the challenging moment you named slightly easier without assuming what caused it.";
  const nextStep = noteNamesHelpfulExperience
    ? "Next step: choose a brief version you can complete once before the next busy block, then notice whether it helps."
    : "Next step: choose one brief preparation or transition you can try before the same kind of situation, then notice what changes.";

  return {
    answer: [
      `You recorded that “${sentenceFragment(note)}.” This is your observation, not proof that one behavior caused the result.`,
      experiment,
      nextStep,
      "Your saved information and Routine are unchanged.",
    ].join("\n\n"),
    sourceIds: ["recent_check_ins"],
  };
}

function requestedOutcome(question: string) {
  if (/\bsleep|insomnia|bedtime\b/i.test(question)) return "sleep";
  if (/\benergy|fatigue|tired\b/i.test(question)) return "energy";
  if (/\bweight|appetite|nutrition|diet\b/i.test(question)) return "weight or nutrition";
  if (/\bfocus|memory|cognit|concentration\b/i.test(question)) return "focus or cognition";
  if (/\bstress|mood|anxiety|emotional\b/i.test(question)) return "emotional wellbeing";
  return null;
}

function limitationFor(input: GroundedCoachFallbackInput) {
  if (input.missingContextLabels.length) {
    const labels = input.missingContextLabels.slice(0, 2).map((label) => label.replace(/[.]$/, ""));
    return `The most useful missing information is: ${labels.join("; ")}.`;
  }
  if (input.intent === "SAFETY_REVIEW" || input.intent === "TIMING_OR_DOSING") {
    return "I could not verify the exact item, recorded amount, timing, and complete safety context needed for a reliable answer.";
  }
  if (REGIMEN_INTENTS.has(input.intent)) {
    return "I could not determine which exact Routine item and recorded field should answer this question.";
  }
  if (input.intent === "PROGRESS_COACHING") {
    return "I could not verify enough comparable check-ins to interpret a trend or attribute a result to one behavior.";
  }
  if (input.intent === "BEHAVIORAL_COACHING" || input.intent === "PRIORITIZATION") {
    return "I could not verify which single outcome or weekly commitment should take priority.";
  }
  if (input.intent === "PLAN_EXPLANATION") {
    return "I could not connect the question to one specific Blueprint priority with enough confidence.";
  }
  if (EVIDENCE_INTENTS.has(input.intent)) {
    const outcome = requestedOutcome(input.question);
    if (input.evidenceOptions.length >= 2 && outcome) {
      return "I could not verify enough evidence and safety reasoning to complete a reliable head-to-head comparison.";
    }
    if (input.evidenceOptions.length && outcome) {
      return "I could not verify enough evidence and safety reasoning to complete a personalized recommendation.";
    }
    if (!input.evidenceOptions.length) {
      return "I could not find a matching curated evidence record for the exact option named in the question.";
    }
    return "I could not verify the exact outcome and comparison needed for a complete personalized answer.";
  }
  return "I could not verify which saved record or outcome the question refers to.";
}

function groundedPortion(input: GroundedCoachFallbackInput) {
  if (["BEHAVIORAL_COACHING", "PRIORITIZATION", "PROGRESS_COACHING"].includes(input.intent) && input.activePractice?.actionLabel) {
    const target = input.activePractice.frequencyPerWeek;
    const progress = target && target > 0
      ? `, with ${input.activePractice.completionCount} of ${target} planned practice completions recorded`
      : "";
    const volume = input.activePractice.knownTotalQuantity != null && input.activePractice.totalQuantityUnit
      ? ` (${input.activePractice.knownTotalQuantity} ${input.activePractice.totalQuantityUnit} recorded in total)`
      : "";
    return {
      text: `I can verify that your active weekly practice is ${sentenceFragment(input.activePractice.actionLabel)}${progress}${volume}.`,
      sourceIds: ["weekly_practice"],
    };
  }
  if (input.intent === "PLAN_EXPLANATION" && input.blueprintPriorities.length) {
    return {
      text: `I can verify that your latest Blueprint includes ${input.blueprintPriorities.slice(0, 2).join(" and ")} as longer-term priorities.`,
      sourceIds: ["current_blueprint"],
    };
  }
  if (REGIMEN_INTENTS.has(input.intent) && input.routineCount > 0) {
    return {
      text: `I can verify that ${input.routineCount} current medication, hormone, and supplement records are available in your Routine.`,
      sourceIds: ["current_routine"],
    };
  }
  if (EVIDENCE_INTENTS.has(input.intent) && input.evidenceOptions.length) {
    const names = input.evidenceOptions.slice(0, 2).map((option) => option.name);
    return {
      text: `I found grounded LVE360 evidence for ${names.join(" and ")}, but I could not verify enough context to compare or select an option reliably.`,
      sourceIds: input.evidenceOptions.slice(0, 2).map((option) => option.id),
    };
  }
  return {
    text: "I could not verify a complete grounded answer from the information currently available, so I will not guess.",
    sourceIds: [],
  };
}

function nextStepFor(input: GroundedCoachFallbackInput) {
  if (input.missingContextLabels.length) {
    return `Next step: ${input.missingContextLabels[0]} Then ask the same question again.`;
  }
  if (input.intent === "SAFETY_REVIEW" || input.intent === "TIMING_OR_DOSING") {
    return "Next step: ask about one exact item by name and include the amount and timing recorded on its current label or instructions.";
  }
  if (REGIMEN_INTENTS.has(input.intent)) {
    return "Next step: ask one record-only question about an exact item, such as, “Is this item in my current Routine, and what amount and timing are recorded?”";
  }
  if (["BEHAVIORAL_COACHING", "PRIORITIZATION", "PROGRESS_COACHING"].includes(input.intent) && input.activePractice?.actionLabel) {
    const minimumVersion = isUsableMinimumVersionText(input.activePractice.minimumVersion)
      ? sentenceFragment(input.activePractice.minimumVersion!)
      : null;
    if (!minimumVersion) {
      return "Next step: open Today and record a concrete hard-day version of your weekly practice, then ask what is realistic to complete today.";
    }
    return `Next step: ask, “What is the minimum version of my current weekly practice today?” The recorded minimum is ${minimumVersion}.`;
  }
  if (input.intent === "PLAN_EXPLANATION" && input.blueprintPriorities[0]) {
    return `Next step: ask, “How does my current weekly practice connect to ${input.blueprintPriorities[0]}?”`;
  }
  if (EVIDENCE_INTENTS.has(input.intent) && input.evidenceOptions[0]) {
    const outcome = requestedOutcome(input.question) ?? "one specific outcome";
    return `Next step: ask, “What does LVE360's evidence say about ${input.evidenceOptions[0].name} for ${outcome}, without changing my Routine?”`;
  }
  const destination = input.page === "journey" ? "Journey" : input.page === "blueprint" ? "Blueprint" : input.page === "routine" ? "Routine" : "Today";
  return `Next step: open the linked ${destination} record, choose one exact item or outcome, and ask one narrower question about it.`;
}

export function buildGroundedCoachFallback(input: GroundedCoachFallbackInput): GroundedCoachFallback {
  const contextualFallback = memberContextFallback(input);
  if (contextualFallback) return contextualFallback;

  const available = new Set(input.availableSourceIds);
  const partial = groundedPortion(input);
  const safetyBoundary = input.intent === "SAFETY_REVIEW" || input.intent === "TIMING_OR_DOSING"
    ? "Keep medication and hormone instructions unchanged, and confirm any conflicting instruction with your clinician or healthcare provider."
    : null;
  const answer = [
    partial.text,
    limitationFor(input),
    nextStepFor(input),
    safetyBoundary,
    "Your saved information and Routine are unchanged.",
  ].filter(Boolean).join("\n\n");
  return {
    answer,
    sourceIds: uniqueAvailable(partial.sourceIds, available),
  };
}
