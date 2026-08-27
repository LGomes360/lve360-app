import {
  identityLabel,
  type IdentityDirection,
} from "../lib/activation.ts";
import {
  fallbackDailyIntentionSuggestions,
  validateDailyIntention,
  type DailyIntentionGroundingKey,
} from "../lib/dailyIntention.ts";
import { normalizeMemberReportedContext } from "../lib/memberReportedContext.ts";
import {
  earlierUnrecordedOccurrences,
  nextUpcomingOccurrence,
  unrecordedOccurrencesAtOrBefore,
  type RegimenDoseOccurrence,
} from "../lib/regimenDose.ts";
import {
  deterministicTodayBrief,
  todayBriefGrounding,
  type TodayBriefContext,
} from "../lib/todayBrief.ts";
import {
  deterministicWeeklySynthesis,
  type WeeklySynthesisContext,
  type WeeklySynthesisHistoryWeek,
} from "../lib/weeklySynthesis.ts";
import {
  PERSONA_REGRESSION_PERSONAS,
  PERSONA_REGRESSION_WEEKS,
  type PersonaRegressionFixture,
} from "./fixtures/personaRegressionFixtures.ts";

export type PersonaRegressionFailure = {
  personaId: string;
  personaLabel: string;
  week: number;
  scenario: string;
  invariant: string;
  detail: string;
};

export type PersonaRegressionReport = {
  personaCount: number;
  weeksPerPersona: number;
  personaWeeks: number;
  assertions: number;
  failures: PersonaRegressionFailure[];
  coverage: {
    ageBands: string[];
    identityDirections: string[];
    outcomes: string[];
    regimenComplexities: string[];
    technicalConfidence: string[];
    accessNeeds: string[];
  };
};

type Check = (
  condition: unknown,
  invariant: string,
  detail: string,
) => void;

const DISCOURAGING_LANGUAGE = /\b(?:failed|failure|lazy|behind|should have|haven't|have not|make up for|overdue)\b/i;
const UNSAFE_GUIDANCE = /\b(?:diagnos\w*|treat\w*|cure\w*|change (?:a |your )?dose|stop (?:a |your )?medication|take it now|catch up on a dose)\b/i;

function unique(values: string[]) {
  return [...new Set(values)].sort();
}

function weekStart(week: number) {
  return `2026-09-${String(1 + ((week - 1) * 7)).padStart(2, "0")}`;
}

function completedDates(week: number, count: number) {
  const start = 1 + ((week - 1) * 7);
  return Array.from({ length: count }, (_, index) => (
    `2026-09-${String(start + index).padStart(2, "0")}`
  ));
}

function weekSignals(persona: PersonaRegressionFixture, week: number) {
  if (week === 1) return {
    completed: Math.max(1, persona.target - 1),
    difficulty: 3,
    valueRating: 4,
    sleep: 4,
    energy: 7,
    note: persona.initialContext,
  };
  if (week === 2) return {
    completed: 1,
    difficulty: 4,
    valueRating: 4,
    sleep: 2,
    energy: 3,
    note: "A lower-energy day made the smallest version feel more realistic.",
  };
  if (week === 3) return {
    completed: 0,
    difficulty: 3,
    valueRating: 3,
    sleep: null,
    energy: null,
    note: null,
  };
  return {
    completed: Math.max(1, persona.target - 1),
    difficulty: 2,
    valueRating: 5,
    sleep: 4,
    energy: 8,
    note: persona.changedContext,
  };
}

function intentionGrounding(
  persona: PersonaRegressionFixture,
  week: number,
  note: string | null,
  historyWeeks: number,
) {
  const reasons: Partial<Record<DailyIntentionGroundingKey, string>> = {
    active_practice: `Connected to this week's practice: ${persona.actionLabel}.`,
    saved_goal: `Connected to your saved goal: ${persona.savedGoal}`,
    identity_direction: `Matches the direction you chose: ${identityLabel(persona.identityDirection)}.`,
    recent_check_in: note ? `Uses what you recorded in your recent check-in: ${note}` : undefined,
    weekly_learning: historyWeeks ? `Carries forward learning from ${historyWeeks} completed ${historyWeeks === 1 ? "week" : "weeks"}.` : undefined,
  };
  const keysByWeek: Record<number, DailyIntentionGroundingKey[]> = {
    1: ["active_practice", "saved_goal", "identity_direction"],
    2: ["recent_check_in", "active_practice", "identity_direction"],
    3: ["weekly_learning", "saved_goal", "identity_direction"],
    4: ["recent_check_in", "weekly_learning", "active_practice"],
  };
  return { reasons, requiredKeys: keysByWeek[week] };
}

function todayContext(
  persona: PersonaRegressionFixture,
  week: number,
  signal: ReturnType<typeof weekSignals>,
  note: string | null,
): TodayBriefContext {
  return {
    localDate: completedDates(week, 1)[0],
    experiment: {
      id: `${persona.id}-week-${week}`,
      identity: identityLabel(persona.identityDirection),
      actionLabel: persona.actionLabel,
      cue: persona.cue,
      minimumVersion: persona.minimumVersion,
      target: persona.target,
      completed: signal.completed,
      completedToday: false,
      connectionSummary: `Connected to your saved goal: ${persona.savedGoal}`,
    },
    blueprint: null,
    checkIn: week === 3 ? null : {
      sleep: signal.sleep,
      energy: signal.energy,
      weightRecorded: false,
      memberReportedContext: note,
    },
    reviewDue: week === 3,
  };
}

function weeklyContext(
  persona: PersonaRegressionFixture,
  week: number,
  signal: ReturnType<typeof weekSignals>,
  note: string | null,
  history: WeeklySynthesisHistoryWeek[],
): WeeklySynthesisContext {
  return {
    experiment: {
      id: `${persona.id}-week-${week}`,
      identity_direction: persona.identityDirection,
      action_label: persona.actionLabel,
      cue: persona.cue,
      frequency_per_week: persona.target,
      target_quantity: null,
      quantity_unit: null,
      minimum_quantity: null,
      minimum_quantity_unit: null,
      minimum_version: persona.minimumVersion,
      week_start: weekStart(week),
    },
    completedDates: completedDates(week, signal.completed),
    completedCount: signal.completed,
    target: persona.target,
    difficulty: signal.difficulty,
    valueRating: signal.valueRating,
    checkIns: week === 3 ? [] : [{
      date: completedDates(week, 1)[0],
      sleep: signal.sleep,
      energy: signal.energy,
      memberReportedContext: note,
    }],
    history: [...history],
  };
}

function routineOccurrences(persona: PersonaRegressionFixture): RegimenDoseOccurrence[] {
  const itemKind = persona.regimenComplexity === "supplement_stack" ? "supplement" : "medication";
  return ["06:00", "08:30", "10:30"].map((time, index) => ({
    eventId: null,
    regimenItemId: `${persona.id}-routine-${index + 1}`,
    itemName: `Saved routine item ${index + 1}`,
    itemKind,
    dose: null,
    date: "2026-09-22",
    slotKey: time,
    time,
    timeLabel: time,
    status: null,
  }));
}

function evaluateCoverage(report: PersonaRegressionReport) {
  const globalCheck = (
    condition: unknown,
    invariant: string,
    detail: string,
  ) => {
    report.assertions += 1;
    if (!condition) report.failures.push({
      personaId: "matrix",
      personaLabel: "24-persona coverage matrix",
      week: 0,
      scenario: "coverage",
      invariant,
      detail,
    });
  };

  globalCheck(report.personaCount === 24, "exact_persona_count", `Expected 24 personas, found ${report.personaCount}.`);
  globalCheck(report.weeksPerPersona >= 4, "multi_week_depth", `Expected at least four weeks, found ${report.weeksPerPersona}.`);
  globalCheck(new Set(PERSONA_REGRESSION_PERSONAS.map((persona) => persona.id)).size === 24, "unique_persona_ids", "Persona IDs must be unique.");
  globalCheck(report.coverage.ageBands.length === 4, "age_coverage", "All four age bands must be represented.");
  globalCheck(report.coverage.identityDirections.length === REQUIRED_IDENTITY_DIRECTIONS.length, "identity_coverage", "All nine LVE identity directions must be represented.");
  globalCheck(report.coverage.outcomes.length === 4, "lve_outcome_coverage", "Longevity, vitality, energy, and happiness must all be represented.");
  globalCheck(report.coverage.regimenComplexities.length === 5, "regimen_coverage", "The matrix must cover no regimen through mixed medication, hormone, and supplement routines.");
  globalCheck(report.coverage.technicalConfidence.length === 3, "technical_confidence_coverage", "Low, moderate, and high technical confidence must be represented.");
  globalCheck(report.coverage.accessNeeds.length >= 8, "accessibility_coverage", "The matrix must include a broad set of accessibility and burden-reduction needs.");
}

export function runPersonaRegressionHarness(): PersonaRegressionReport {
  const report: PersonaRegressionReport = {
    personaCount: PERSONA_REGRESSION_PERSONAS.length,
    weeksPerPersona: PERSONA_REGRESSION_WEEKS.length,
    personaWeeks: PERSONA_REGRESSION_PERSONAS.length * PERSONA_REGRESSION_WEEKS.length,
    assertions: 0,
    failures: [],
    coverage: {
      ageBands: unique(PERSONA_REGRESSION_PERSONAS.map((persona) => persona.ageBand)),
      identityDirections: unique(PERSONA_REGRESSION_PERSONAS.map((persona) => persona.identityDirection)),
      outcomes: unique(PERSONA_REGRESSION_PERSONAS.flatMap((persona) => persona.outcomes)),
      regimenComplexities: unique(PERSONA_REGRESSION_PERSONAS.map((persona) => persona.regimenComplexity)),
      technicalConfidence: unique(PERSONA_REGRESSION_PERSONAS.map((persona) => persona.technicalConfidence)),
      accessNeeds: unique(PERSONA_REGRESSION_PERSONAS.flatMap((persona) => persona.accessNeeds)),
    },
  };

  evaluateCoverage(report);

  for (const persona of PERSONA_REGRESSION_PERSONAS) {
    const originalFixture = JSON.stringify(persona);
    const priorIntentionPhrases: string[] = [];
    const history: WeeklySynthesisHistoryWeek[] = [];

    for (const { week, scenario } of PERSONA_REGRESSION_WEEKS) {
      const check: Check = (condition, invariant, detail) => {
        report.assertions += 1;
        if (!condition) report.failures.push({
          personaId: persona.id,
          personaLabel: persona.label,
          week,
          scenario,
          invariant,
          detail,
        });
      };

      try {
        const signal = weekSignals(persona, week);
        const note = normalizeMemberReportedContext(signal.note);
        check(note === signal.note, "bounded_member_context", "Saved qualitative context should remain readable after normalization.");
        check(!note || (note.length <= 280 && !/[<>]/.test(note)), "sanitized_member_context", "Member-reported context must remain bounded and free of markup delimiters.");

        const { reasons, requiredKeys } = intentionGrounding(persona, week, note, history.length);
        const suggestions = fallbackDailyIntentionSuggestions(persona.identityDirection, {
          groundingReasons: reasons,
          requiredGroundingKeys: requiredKeys,
          excludedPhrases: priorIntentionPhrases,
        });
        check(suggestions.length === 3, "three_intention_choices", `Expected three intention suggestions, found ${suggestions.length}.`);
        check(suggestions.every((suggestion) => validateDailyIntention(suggestion.phrase).ok), "valid_identity_intentions", "Every intention must remain a positive, bounded identity statement.");
        check(requiredKeys.every((key) => suggestions.some((suggestion) => suggestion.groundingKey === key)), "intention_grounding_coverage", `Suggestions must represent ${requiredKeys.join(", ")}.`);
        check(suggestions.every((suggestion) => suggestion.whyThisFits === reasons[suggestion.groundingKey]), "deterministic_why_this_fits", "Each explanation must come from canonical saved context, not generated rationale.");
        if (week > 1) {
          check(suggestions.some((suggestion) => !priorIntentionPhrases.includes(suggestion.phrase)), "intention_rotation", "At least one intention should rotate away from prior saved choices when alternatives exist.");
        }
        priorIntentionPhrases.push(...suggestions.map((suggestion) => suggestion.phrase));

        const dailyContext = todayContext(persona, week, signal, note);
        const brief = deterministicTodayBrief(dailyContext);
        const grounding = todayBriefGrounding(dailyContext, "fallback");
        check(!DISCOURAGING_LANGUAGE.test(`${brief.noticed} ${brief.whyItMatters}`), "nonjudgmental_daily_guidance", "Today guidance must avoid shame and deficit language.");
        check(!UNSAFE_GUIDANCE.test(`${brief.noticed} ${brief.whyItMatters} ${brief.nextAction}`), "nonclinical_daily_guidance", "Today guidance must not diagnose or change regimen instructions.");
        if (week === 2) {
          check(brief.nextAction === persona.minimumVersion, "lower_capacity_minimum", "A lower-capacity day must select the saved minimum version.");
        } else if (week === 3) {
          check(brief.primaryAction === "open_review", "return_routes_to_review", "A completed week with a gap must route to reflection instead of catch-up behavior.");
          check(/ready for a short review/i.test(brief.noticed), "gentle_return_language", "Returning after a gap must use neutral, forward-looking language.");
        } else {
          check(brief.nextAction === persona.actionLabel, "saved_action_continuity", "Today must preserve the member's saved weekly action.");
        }
        if (note) {
          check(/member-reported context/i.test(grounding.sourceLabel), "member_context_source_label", "Today must name member-reported context when it contributes to grounding.");
        }

        const synthesisContext = weeklyContext(persona, week, signal, note, history);
        const synthesis = deterministicWeeklySynthesis(synthesisContext);
        check(!DISCOURAGING_LANGUAGE.test(`${synthesis.observation} ${synthesis.hypothesis}`), "nonjudgmental_weekly_learning", "Weekly learning must avoid shame and fabricated failure language.");
        check(!UNSAFE_GUIDANCE.test(`${synthesis.observation} ${synthesis.hypothesis}`), "nonclinical_weekly_learning", "Weekly learning must remain lifestyle support, not clinical direction.");
        check(synthesis.evidence.some((item) => item.label === "Practice completions"), "weekly_completion_evidence", "Weekly synthesis must expose the recorded completion count.");
        if (note) {
          check(synthesis.evidence.some((item) => item.label === "Member-reported context" && /without assuming cause/i.test(item.value)), "bounded_context_evidence", "Qualitative context must be labeled as member-reported and non-causal.");
        }
        if (week === 4) {
          check(synthesis.evidence.some((item) => item.label === "History considered" && /3 prior completed weeks/i.test(item.value)), "multi_week_history", "Week four must transparently include all three prior completed weeks.");
          check(synthesis.evidence.some((item) => item.label === "Comparable completion trend"), "longitudinal_trend", "Comparable history must produce an explicit completion trend.");
        }

        history.push({
          experimentId: synthesisContext.experiment.id,
          weekStart: synthesisContext.experiment.week_start,
          identityDirection: persona.identityDirection,
          actionLabel: persona.actionLabel,
          completionCount: signal.completed,
          target: persona.target,
          difficulty: signal.difficulty,
          valueRating: signal.valueRating,
          decision: synthesis.suggestedDecision,
        });

        if (persona.regimenComplexity !== "none") {
          const occurrences = routineOccurrences(persona);
          check(earlierUnrecordedOccurrences(occurrences, 9 * 60).length === 2, "earlier_routine_summary", "At 09:00, the 06:00 and 08:30 items must be earlier and unrecorded.");
          check(nextUpcomingOccurrence(occurrences, 9 * 60)?.time === "10:30", "next_routine_summary", "At 09:00, the 10:30 item must remain the next upcoming occurrence.");
          check(unrecordedOccurrencesAtOrBefore(occurrences, 9 * 60).length === 2, "safe_bulk_boundary", "Bulk completion must exclude the future 10:30 occurrence.");
        }
      } catch (error) {
        check(false, "unexpected_harness_error", error instanceof Error ? error.message : String(error));
      }
    }

    report.assertions += 1;
    if (JSON.stringify(persona) !== originalFixture) report.failures.push({
      personaId: persona.id,
      personaLabel: persona.label,
      week: 4,
      scenario: "changed_context",
      invariant: "immutable_source_record",
      detail: "The simulation mutated the source persona fixture.",
    });
  }

  return report;
}

export function formatPersonaRegressionFailure(failure: PersonaRegressionFailure) {
  return `[${failure.personaId} | week ${failure.week} | ${failure.scenario} | ${failure.invariant}] ${failure.detail}`;
}

export const REQUIRED_IDENTITY_DIRECTIONS: IdentityDirection[] = [
  "movement",
  "nutrition",
  "sleep",
  "emotional_health",
  "relationships",
  "focus",
  "career",
  "happiness",
  "overall_health",
];
