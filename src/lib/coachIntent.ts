import type {
  CoachRegimenKind,
  CoachRoutingDecision,
} from "./contextualCoach";
import type {
  MemberIntelligenceContext,
  MemberRegimenItemContext,
} from "./memberContext";
import { missingContextRequirements } from "./coachTaskValidation.ts";
import { regimenScheduleLabel } from "./regimenSchedule.ts";

export type DeterministicCoachTaskResult = {
  answer: string;
  sourceIds: string[];
  responseSource: "deterministic";
};

const KIND_LABELS: Record<CoachRegimenKind, string> = {
  medication: "Medications",
  hormone: "Hormones",
  supplement: "Supplements",
  endocrine_active_supplement: "Endocrine-active supplements",
};

function itemsForKind(context: MemberIntelligenceContext, kind: CoachRegimenKind): MemberRegimenItemContext[] {
  if (kind === "medication") return context.regimen.medications.value;
  if (kind === "hormone") return context.regimen.hormones.value;
  if (kind === "supplement") return context.regimen.supplements.value;
  return context.regimen.endocrineActiveSupplements.value;
}

function kindsForRoute(route: CoachRoutingDecision): CoachRegimenKind[] {
  if (route.requestedRegimenKinds.length) return route.requestedRegimenKinds;
  if (route.intent === "MEDICATION_LOOKUP") return ["medication"];
  if (route.intent === "HORMONE_LOOKUP") return ["hormone"];
  if (route.intent === "SUPPLEMENT_LOOKUP" || route.intent === "CURRENT_PLAN_LOOKUP") {
    return ["supplement", "endocrine_active_supplement"];
  }
  return ["medication", "hormone", "supplement", "endocrine_active_supplement"];
}

function field(value: string | null | undefined, label: string): string {
  return value?.trim() || `${label} not recorded`;
}

function regimenLookup(route: CoachRoutingDecision, context: MemberIntelligenceContext): DeterministicCoachTaskResult {
  const kinds = kindsForRoute(route);
  const sections = kinds.map((kind) => {
    const items = itemsForKind(context, kind);
    const lines = items.length
      ? items.map((item) => {
        const details = [
          `dose: ${field(item.dose, "dose")}`,
          `timing: ${field(item.timing, "timing")}`,
          `schedule: ${item.schedule ? regimenScheduleLabel(item.schedule) : "schedule not recorded"}`,
        ];
        return `- ${item.name} (${details.join("; ")})`;
      })
      : ["- None currently recorded."];
    return `${KIND_LABELS[kind]}:\n${lines.join("\n")}`;
  });
  return {
    answer: `Here is exactly what is saved in your current Routine for the requested categories:\n\n${sections.join("\n\n")}\n\nThis is a record lookup. Nothing was added, removed, or changed.`,
    sourceIds: ["current_routine"],
    responseSource: "deterministic",
  };
}

function safetyReview(context: MemberIntelligenceContext): DeterministicCoachTaskResult {
  const section = context.unresolvedSafetyItems;
  if (section.status === "missing") {
    return {
      answer: "I could not complete the deterministic safety review from the saved data right now. Your Routine is unchanged. Try again before relying on this view for a clinician or pharmacist discussion.",
      sourceIds: ["safety_review", "current_routine", "health_profile"],
      responseSource: "deterministic",
    };
  }
  const unique = [...new Map(section.value.map((item) => [
    `${item.code}|${item.item.toLowerCase()}|${item.message.toLowerCase()}`,
    item,
  ])).values()];
  if (!unique.length) {
    return {
      answer: "LVE360 did not identify an unresolved clinician- or pharmacist-review finding in the current deterministic safety check. That means no rule matched the information currently saved; it is not a guarantee that every combination is risk-free. Review any new symptoms, diagnoses, prescriptions, or incomplete Routine details with a qualified professional.",
      sourceIds: ["safety_review", "current_routine", "health_profile"],
      responseSource: "deterministic",
    };
  }
  const rank = { danger: 0, warning: 1, info: 2 } as const;
  const findings = unique.sort((left, right) => rank[left.severity] - rank[right.severity]);
  const lines = findings.map((item, index) => `${index + 1}. ${item.item}: ${item.message}`);
  return {
    answer: `These saved Routine items currently need clinician or pharmacist review:\n\n${lines.join("\n")}\n\nThese are review signals from LVE360's deterministic rules, not instructions to change a medication, hormone, or supplement.`,
    sourceIds: ["safety_review", "current_routine", "health_profile"],
    responseSource: "deterministic",
  };
}

function missingContext(context: MemberIntelligenceContext): DeterministicCoachTaskResult {
  const selected = missingContextRequirements(context).map((requirement) => requirement.label);
  return {
    answer: selected.length
      ? `The most useful missing information is:\n\n${selected.map((item, index) => `${index + 1}. ${item}`).join("\n")}\n\nI only listed fields that are actually absent from your current LVE360 context.`
      : "Your core LVE360 context is substantially complete. The next improvement is not another profile field; it is continuing consistent check-ins and weekly reviews so LVE360 has more history to learn from.",
    sourceIds: ["context_status", "current_routine", "health_profile", "goals", "recent_check_ins", "weekly_practice", "preferences"],
    responseSource: "deterministic",
  };
}

function prioritization(context: MemberIntelligenceContext): DeterministicCoachTaskResult {
  const practice = context.activePractice.value;
  const savedGoals = context.goals.saved.value.map((goal) => goal.label);
  const blueprintGoals = context.goals.blueprint.value;
  const goals = [...new Set([...savedGoals, ...blueprintGoals])].slice(0, 3);
  if (!practice?.actionLabel) {
    const goalText = goals[0] ? ` for your recorded goal, ${goals[0]}` : " toward the outcome that matters most to you";
    return {
      answer: `Your highest-value action this week is to choose one small, repeatable weekly practice${goalText}. No active practice is currently recorded, so adding more advice would create options without a clear action. Start with a version that can still count on a hard day.`,
      sourceIds: ["weekly_practice", "goals", "recent_check_ins", "current_blueprint"],
      responseSource: "deterministic",
    };
  }
  const progress = `${practice.completionCount} of ${practice.frequencyPerWeek ?? 0} planned completions are recorded`;
  const minimum = practice.minimumVersion ? ` On a hard day, use your saved minimum version: ${practice.minimumVersion}.` : "";
  const goalReason = goals.length ? ` It supports your recorded priorities: ${goals.join(", ")}.` : "";
  return {
    answer: `The highest-value action is to keep your current weekly practice as the focus: ${practice.actionLabel}. ${progress}.${goalReason}${minimum} Finishing the existing experiment will teach LVE360 more than introducing another change midweek.`,
    sourceIds: ["weekly_practice", "goals", "recent_check_ins", "current_blueprint"],
    responseSource: "deterministic",
  };
}

function behavioralAdjustment(route: CoachRoutingDecision, context: MemberIntelligenceContext, question: string): DeterministicCoachTaskResult | null {
  if (!/\b(?:slept poorly|poor sleep|bad night|rough night|adjust tomorrow)\b/i.test(question)) return null;
  const preserved: string[] = [];
  if (route.constraints.preserveMedicationPlan) preserved.push("medications");
  if (route.constraints.preserveHormonePlan) preserved.push("hormones");
  if (route.constraints.preserveSupplementPlan) preserved.push("supplements");
  const preserveText = preserved.length
    ? `Keep your saved ${preserved.join(" and ")} unchanged.`
    : "Keep your prescribed medication and hormone plan unchanged.";
  const practice = context.activePractice.value;
  const practiceStep = practice?.minimumVersion
    ? `Use the minimum version of your weekly practice if energy is low: ${practice.minimumVersion}.`
    : practice?.actionLabel
      ? `Choose a lighter version of your current weekly practice, ${practice.actionLabel}, if you feel unusually tired.`
      : "Choose a lighter version of planned activity if you feel unusually tired.";
  return {
    answer: `${preserveText} Tomorrow, keep your usual wake time, get outdoor light and gentle movement early in the day, and avoid turning one poor night into an all-or-nothing day. ${practiceStep} In the evening, return to your normal wind-down and record sleep and energy so LVE360 can see whether this was a one-night event or part of a pattern.`,
    sourceIds: ["weekly_practice", "recent_check_ins", "goals", "preferences"],
    responseSource: "deterministic",
  };
}

export function deterministicCoachTask(
  route: CoachRoutingDecision,
  context: MemberIntelligenceContext,
  question: string,
): DeterministicCoachTaskResult | null {
  if (["CURRENT_REGIMEN_LOOKUP", "MEDICATION_LOOKUP", "HORMONE_LOOKUP", "SUPPLEMENT_LOOKUP", "CURRENT_PLAN_LOOKUP"].includes(route.intent)) {
    return regimenLookup(route, context);
  }
  if (route.intent === "SAFETY_REVIEW") return safetyReview(context);
  if (route.intent === "MISSING_CONTEXT") return missingContext(context);
  if (route.intent === "PRIORITIZATION") return prioritization(context);
  if (route.intent === "OUT_OF_SCOPE") {
    return {
      answer: "Ask LVE360 is focused on your saved health, wellness, Routine, goals, and weekly progress. I cannot help with unrelated general-knowledge questions here.",
      sourceIds: [],
      responseSource: "deterministic",
    };
  }
  if (route.intent === "BEHAVIORAL_COACHING") return behavioralAdjustment(route, context, question);
  return null;
}
