import type {
  CoachIntent,
  CoachRoutingDecision,
  StructuredCoachAnswer,
} from "./contextualCoach.ts";
import type {
  MemberIntelligenceContext,
  MemberRegimenItemContext,
} from "./memberContext.ts";
import { healthItemIdentityKey } from "./healthItemIdentity.ts";
import { regimenScheduleLabel } from "./regimenSchedule.ts";

export type CoachTaskValidatorId =
  | "STRUCTURE"
  | "REGIMEN_COVERAGE"
  | "REQUESTED_FIELDS"
  | "TYPE_EXCLUSIONS"
  | "SAFETY_FINDINGS"
  | "SAFETY_REASONING"
  | "CONSTRAINT_ADHERENCE"
  | "ACTIVE_PRACTICE_USE"
  | "REQUESTED_TIME_HORIZON"
  | "PRIORITY_ALIGNMENT"
  | "MISSING_CONTEXT_ACCURACY"
  | "PROGRESS_METRICS"
  | "CAUSAL_BOUNDARY"
  | "CONTROLLED_ACTION_PROPOSAL"
  | "MEMBER_CONTEXT_USE"
  | "MEMBER_REPORTED_CONTEXT_USE"
  | "OUT_OF_SCOPE_BOUNDARY"
  | "EVIDENCE_COVERAGE"
  | "REASONING"
  | "ACTIONABILITY";

export type CoachTaskValidatorResult = {
  validator: CoachTaskValidatorId;
  passed: boolean;
  completeness: number;
  missingRequirements: string[];
  constraintViolations: string[];
};

export type CoachTaskSuccessReport = {
  intent: CoachIntent;
  passed: boolean;
  score: number;
  completeness: number;
  factualCoverage: number;
  validators: CoachTaskValidatorResult[];
  failedValidators: CoachTaskValidatorId[];
  missingRequirements: string[];
  constraintViolations: string[];
};

export type MissingContextRequirement = {
  code: string;
  label: string;
  matchTerms: string[];
};

type CoachTaskValidationInput = {
  route: CoachRoutingDecision;
  question: string;
  answerText: string;
  memberContext: MemberIntelligenceContext;
  structuredAnswer?: StructuredCoachAnswer | null;
  evidenceOptionNames?: string[];
  safetyChecked?: boolean;
  allCandidatesBlocked?: boolean;
};

const REGIMEN_LOOKUP_INTENTS = new Set<CoachIntent>([
  "CURRENT_REGIMEN_LOOKUP",
  "MEDICATION_LOOKUP",
  "HORMONE_LOOKUP",
  "SUPPLEMENT_LOOKUP",
  "CURRENT_PLAN_LOOKUP",
]);

const STOP_WORDS = new Set([
  "about", "after", "again", "because", "before", "being", "current", "deterministic",
  "information", "possible", "recorded", "review", "routine", "saved", "should", "these",
  "using", "with", "your",
]);

function normalized(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function containsValue(answer: string, value: string | null | undefined) {
  const expected = normalized(value ?? "");
  return Boolean(expected) && normalized(answer).includes(expected);
}

const GENERIC_REGIMEN_WORDS = new Set(["vitamin", "magnesium", "omega", "supplement", "medication", "hormone"]);

function questionNamesItem(question: string, name: string) {
  const query = normalized(question);
  const item = normalized(name);
  const identity = healthItemIdentityKey(name).replace(/-/g, " ");
  const firstWord = item.split(" ")[0];
  return Boolean(item && query.includes(item))
    || Boolean(identity && query.includes(identity))
    || Boolean(firstWord.length >= 5 && !GENERIC_REGIMEN_WORDS.has(firstWord) && query.includes(firstWord));
}

function ratio(passed: number, total: number) {
  if (total <= 0) return 1;
  return Math.max(0, Math.min(1, passed / total));
}

function result(
  validator: CoachTaskValidatorId,
  completeness: number,
  missingRequirements: string[] = [],
  constraintViolations: string[] = [],
): CoachTaskValidatorResult {
  const bounded = Math.max(0, Math.min(1, completeness));
  return {
    validator,
    passed: bounded === 1 && missingRequirements.length === 0 && constraintViolations.length === 0,
    completeness: bounded,
    missingRequirements,
    constraintViolations,
  };
}

function allRegimen(context: MemberIntelligenceContext) {
  return [
    ...context.regimen.medications.value,
    ...context.regimen.hormones.value,
    ...context.regimen.supplements.value,
    ...context.regimen.endocrineActiveSupplements.value,
  ];
}

function requestedItems(route: CoachRoutingDecision, context: MemberIntelligenceContext) {
  const kinds = route.requestedRegimenKinds.length
    ? route.requestedRegimenKinds
    : route.intent === "MEDICATION_LOOKUP"
      ? ["medication" as const]
      : route.intent === "HORMONE_LOOKUP"
        ? ["hormone" as const]
        : route.intent === "SUPPLEMENT_LOOKUP" || route.intent === "CURRENT_PLAN_LOOKUP"
          ? ["supplement" as const, "endocrine_active_supplement" as const]
          : ["medication" as const, "hormone" as const, "supplement" as const, "endocrine_active_supplement" as const];
  const requested = new Set(kinds);
  return {
    requested: allRegimen(context).filter((item) => requested.has(item.item_kind)),
    excluded: allRegimen(context).filter((item) => !requested.has(item.item_kind)),
  };
}

function fieldRequested(question: string, field: "dose" | "timing" | "schedule") {
  if (field === "dose") return /\b(?:dose|doses|dosage|how much|strength)\b/i.test(question);
  if (field === "timing") return /\b(?:timing|time|when|morning|afternoon|evening|night)\b/i.test(question);
  return /\b(?:schedule|cadence|frequency|how often|daily|weekly|every other)\b/i.test(question);
}

function fieldCovered(answer: string, item: MemberRegimenItemContext, field: "dose" | "timing" | "schedule") {
  const itemText = answer
    .split(/\n+|(?<=[.!?])\s+/)
    .filter((segment) => containsValue(segment, item.name))
    .join(" ");
  if (!itemText) return false;
  if (field === "dose") return item.dose ? containsValue(itemText, item.dose) : /dose not recorded/i.test(itemText);
  if (field === "timing") return item.timing ? containsValue(itemText, item.timing) : /timing not recorded/i.test(itemText);
  if (!item.schedule) return /schedule not recorded/i.test(itemText);
  return containsValue(itemText, regimenScheduleLabel(item.schedule));
}

function regimenValidators(input: CoachTaskValidationInput) {
  const { requested, excluded } = requestedItems(input.route, input.memberContext);
  const included = requested.filter((item) => containsValue(input.answerText, item.name));
  const missingNames = requested.filter((item) => !containsValue(input.answerText, item.name));
  const emptyCovered = requested.length > 0 || /\b(?:none|did not find|no current|not recorded)\b/i.test(input.answerText);
  const coverage = requested.length ? ratio(included.length, requested.length) : Number(emptyCovered);

  const requestedFields = (["dose", "timing", "schedule"] as const).filter((field) => fieldRequested(input.question, field));
  const fieldChecks = requested.flatMap((item) => requestedFields.map((field) => ({ item, field })));
  const missingFields = fieldChecks.filter(({ item, field }) => !fieldCovered(input.answerText, item, field));
  const fieldCoverage = ratio(fieldChecks.length - missingFields.length, fieldChecks.length);

  const requestedNames = new Set(requested.map((item) => normalized(item.name)));
  const unexpected = excluded.filter((item) => !requestedNames.has(normalized(item.name)) && containsValue(input.answerText, item.name));
  return [
    result("REGIMEN_COVERAGE", coverage, missingNames.map((item) => `regimen_item:${item.item_kind}:${normalized(item.name)}`)),
    result("REQUESTED_FIELDS", fieldCoverage, missingFields.map(({ item, field }) => `regimen_field:${item.item_kind}:${normalized(item.name)}:${field}`)),
    result("TYPE_EXCLUSIONS", unexpected.length ? 0 : 1, [], unexpected.map((item) => `unexpected_regimen_type:${item.item_kind}:${normalized(item.name)}`)),
  ];
}

function importantWords(value: string) {
  return normalized(value)
    .split(" ")
    .filter((word) => word.length >= 5 && !STOP_WORDS.has(word));
}

function safetyValidators(input: CoachTaskValidationInput) {
  const section = input.memberContext.unresolvedSafetyItems;
  if (section.status === "missing") {
    const bounded = /\b(?:could not complete|unavailable|try again|not rely)\b/i.test(input.answerText);
    return [
      result("SAFETY_FINDINGS", Number(bounded), bounded ? [] : ["safety_evaluation_unavailable"]),
      result("SAFETY_REASONING", Number(bounded), bounded ? [] : ["safety_limitation_not_explained"]),
    ];
  }

  const unique = [...new Map(section.value.map((item) => [
    `${item.code}|${normalized(item.item)}|${normalized(item.message)}`,
    item,
  ])).values()];
  const namedRegimen = allRegimen(input.memberContext).filter((item) => questionNamesItem(input.question, item.name));
  const namedKeys = new Set(namedRegimen.map((item) => healthItemIdentityKey(item.name)));
  const relevant = namedKeys.size
    ? unique.filter((item) => namedKeys.has(healthItemIdentityKey(item.item)))
    : unique;
  if (!relevant.length) {
    const noFinding = /\b(?:did not identify|no unresolved|no rule matched)\b/i.test(input.answerText);
    const limitation = /\b(?:not a guarantee|not absolute|information currently saved|risk[- ]free)\b/i.test(input.answerText);
    return [
      result("SAFETY_FINDINGS", Number(noFinding), noFinding ? [] : ["no_findings_result_missing"]),
      result("SAFETY_REASONING", Number(limitation), limitation ? [] : ["no_findings_limitation_missing"]),
    ];
  }

  const surfaced = relevant.filter((item) => containsValue(input.answerText, item.item));
  const explained = relevant.filter((item) => {
    if (!containsValue(input.answerText, item.item)) return false;
    const words = importantWords(item.message);
    return words.length === 0 || words.some((word) => normalized(input.answerText).includes(word));
  });
  return [
    result("SAFETY_FINDINGS", ratio(surfaced.length, relevant.length), relevant.filter((item) => !surfaced.includes(item)).map((item) => `safety_item:${item.code}:${normalized(item.item)}`)),
    result("SAFETY_REASONING", ratio(explained.length, relevant.length), relevant.filter((item) => !explained.includes(item)).map((item) => `safety_reason:${item.code}:${normalized(item.item)}`)),
  ];
}

function sentences(value: string) {
  return value.split(/(?<=[.!?])\s+|\n+/).map((item) => item.trim()).filter(Boolean);
}

function changeViolationFor(items: MemberRegimenItemContext[], kindPattern: RegExp, answer: string) {
  const change = /\b(?:start|begin|stop|quit|add|remove|increase|decrease|double|halve|change|adjust|skip|replace|switch)\b/i;
  return sentences(answer).some((sentence) => {
    if (/\b(?:do not|don't|not changing|without changing|keep|unchanged|remain unchanged|no change)\b/i.test(sentence)) return false;
    if (!change.test(sentence)) return false;
    return kindPattern.test(sentence) || items.some((item) => containsValue(sentence, item.name));
  });
}

function constraintValidator(input: CoachTaskValidationInput) {
  const violations: string[] = [];
  const constraints = input.route.constraints;
  if (constraints.preserveMedicationPlan && changeViolationFor(input.memberContext.regimen.medications.value, /\b(?:medication|medications|meds|prescription)\b/i, input.answerText)) {
    violations.push("preserve_medication_plan");
  }
  if (constraints.preserveHormonePlan && changeViolationFor(input.memberContext.regimen.hormones.value, /\b(?:hormone|hormones)\b/i, input.answerText)) {
    violations.push("preserve_hormone_plan");
  }
  const supplements = [...input.memberContext.regimen.supplements.value, ...input.memberContext.regimen.endocrineActiveSupplements.value];
  if (constraints.preserveSupplementPlan && changeViolationFor(supplements, /\b(?:supplement|supplements|vitamin|vitamins|mineral|minerals|stack)\b/i, input.answerText)) {
    violations.push("preserve_supplement_plan");
  }
  return result("CONSTRAINT_ADHERENCE", violations.length ? 0 : 1, [], violations);
}

function activePracticeValidator(input: CoachTaskValidationInput) {
  const practice = input.memberContext.activePractice.value;
  if (!practice) return result("ACTIVE_PRACTICE_USE", 1);
  const covered = containsValue(input.answerText, practice.actionLabel)
    || containsValue(input.answerText, practice.minimumVersion)
    || (input.route.intent === "BEHAVIORAL_COACHING" && /\bweekly practice\b/i.test(input.answerText));
  return result("ACTIVE_PRACTICE_USE", Number(covered), covered ? [] : ["active_practice_not_used"]);
}

function timeHorizonValidator(input: CoachTaskValidationInput) {
  const requested = [
    /\btomorrow\b/i.test(input.question) ? "tomorrow" : null,
    /\btoday\b/i.test(input.question) ? "today" : null,
    /\bthis week\b|\bnext[- ]week\b|\bweekly\b/i.test(input.question) ? "week" : null,
  ].filter((value): value is string => Boolean(value));
  const missing = requested.filter((value) => !new RegExp(`\\b${value}`).test(normalized(input.answerText)));
  return result("REQUESTED_TIME_HORIZON", ratio(requested.length - missing.length, requested.length), missing.map((value) => `time_horizon:${value}`));
}

function priorityValidator(input: CoachTaskValidationInput) {
  const practice = input.memberContext.activePractice.value;
  if (practice?.actionLabel) {
    const covered = containsValue(input.answerText, practice.actionLabel);
    return result("PRIORITY_ALIGNMENT", Number(covered), covered ? [] : ["active_practice_priority_missing"]);
  }
  const acknowledgesGap = /\b(?:no active practice|choose one|start with one)\b/i.test(input.answerText);
  return result("PRIORITY_ALIGNMENT", Number(acknowledgesGap), acknowledgesGap ? [] : ["no_active_practice_not_acknowledged"]);
}

export function missingContextRequirements(context: MemberIntelligenceContext): MissingContextRequirement[] {
  const requirements: MissingContextRequirement[] = [];
  const regimen = allRegimen(context);
  for (const item of regimen.filter((candidate) => !candidate.dose?.trim())) {
    requirements.push({
      code: `regimen:${normalized(item.name)}:dose`,
      label: `Add the missing dose for ${item.name}.`,
      matchTerms: [item.name, "dose"],
    });
  }
  for (const item of regimen.filter((candidate) => !candidate.timing?.trim())) {
    requirements.push({
      code: `regimen:${normalized(item.name)}:timing`,
      label: `Add the missing timing for ${item.name}.`,
      matchTerms: [item.name, "timing"],
    });
  }
  if (context.healthProfile.status === "missing") requirements.push({ code: "health_profile", label: "Complete the intake health profile.", matchTerms: ["health profile"] });
  if (context.goals.saved.status === "missing" && context.goals.blueprint.status === "missing") requirements.push({ code: "goals", label: "Record at least one current goal.", matchTerms: ["goal"] });
  if (context.recentCheckIns.status === "missing") requirements.push({ code: "recent_check_ins", label: "Record a few sleep, energy, or weight check-ins.", matchTerms: ["check-ins", "check ins"] });
  if (context.activePractice.status === "missing") requirements.push({ code: "active_practice", label: "Choose one active weekly practice.", matchTerms: ["weekly practice"] });
  if (context.preferences.status === "missing") requirements.push({ code: "preferences", label: "Save timezone and reminder preferences.", matchTerms: ["preferences", "timezone"] });
  return requirements.slice(0, 5);
}

function missingContextValidator(input: CoachTaskValidationInput) {
  const requirements = missingContextRequirements(input.memberContext);
  if (!requirements.length) {
    const complete = /\b(?:substantially complete|no important information is missing|core context is complete)\b/i.test(input.answerText);
    return result("MISSING_CONTEXT_ACCURACY", Number(complete), complete ? [] : ["complete_context_not_acknowledged"]);
  }
  const covered = requirements.filter((requirement) => requirement.code.startsWith("regimen:")
    ? requirement.matchTerms.every((term) => containsValue(input.answerText, term))
    : requirement.matchTerms.some((term) => containsValue(input.answerText, term)));
  const violations: string[] = [];
  if (input.memberContext.healthProfile.status !== "missing" && /health profile[^.\n]{0,50}\b(?:missing|incomplete|not recorded)\b/i.test(input.answerText)) violations.push("existing_health_profile_labeled_missing");
  if ((input.memberContext.goals.saved.value.length || input.memberContext.goals.blueprint.value.length) && /\bgoals?[^.\n]{0,50}\b(?:missing|not recorded|none)\b/i.test(input.answerText)) violations.push("existing_goals_labeled_missing");
  if (input.memberContext.activePractice.value && /\b(?:weekly|active) practice[^.\n]{0,50}\b(?:missing|not recorded|none)\b/i.test(input.answerText)) violations.push("existing_practice_labeled_missing");
  const completeness = ratio(covered.length, requirements.length);
  return result(
    "MISSING_CONTEXT_ACCURACY",
    violations.length ? Math.min(completeness, 0.5) : completeness,
    requirements.filter((requirement) => !covered.includes(requirement)).map((requirement) => requirement.code),
    violations,
  );
}

function progressValidators(input: CoachTaskValidationInput) {
  const requestedMetrics = [
    /\bsleep\b/i.test(input.question) ? "sleep" : null,
    /\benergy\b/i.test(input.question) ? "energy" : null,
    /\bweight\b/i.test(input.question) ? "weight" : null,
  ].filter((value): value is string => Boolean(value));
  const missing = requestedMetrics.filter((metric) => !containsValue(input.answerText, metric));
  const metricsResult = result(
    "PROGRESS_METRICS",
    ratio(requestedMetrics.length - missing.length, requestedMetrics.length),
    missing.map((metric) => `progress_metric:${metric}`),
  );
  const comparisonRequested = /\b(?:compare|trend|pattern|change|better|worse|improv)\b/i.test(input.question);
  const bounded = !comparisonRequested || /\b(?:observation|not proof|does not prove|cannot show caus|association|pattern)\b/i.test(input.answerText);
  return [
    metricsResult,
    result("CAUSAL_BOUNDARY", Number(bounded), bounded ? [] : ["causal_limit_missing"]),
    activePracticeValidator(input),
  ];
}

function nextWeekPracticeRequest(input: CoachTaskValidationInput) {
  return /\bnext[- ]week\b/i.test(input.question) && /\b(?:habit|practice|focus|action)\b/i.test(input.question);
}

function nextWeekPracticeValidators(input: CoachTaskValidationInput) {
  const proposal = input.structuredAnswer?.proposedAction;
  return [
    result(
      "CONTROLLED_ACTION_PROPOSAL",
      Number(Boolean(proposal)),
      proposal ? [] : ["next_week_practice_proposal_missing"],
    ),
    timeHorizonValidator(input),
    memberContextValidator(input),
    ...generalValidators(input),
  ];
}

function outOfScopeValidator(input: CoachTaskValidationInput) {
  const boundary = /\b(?:focused on|cannot help with|outside|unrelated|health|wellness|routine|goals)\b/i.test(input.answerText);
  const answeredTrivia = /\bparis\b/i.test(input.answerText) && /\bcapital of france\b/i.test(input.question);
  return result("OUT_OF_SCOPE_BOUNDARY", boundary && !answeredTrivia ? 1 : 0, boundary ? [] : ["out_of_scope_boundary_missing"], answeredTrivia ? ["out_of_scope_answered"] : []);
}

function evidenceValidators(input: CoachTaskValidationInput, requestedCount = 2) {
  const allowed = input.evidenceOptionNames ?? [];
  const options = input.structuredAnswer?.options ?? [];
  const requiredCount = Math.min(requestedCount, allowed.length);
  const validOptions = options.filter((option) => allowed.some((name) => normalized(name) === normalized(option.name)));
  const blockedExplanation = input.allCandidatesBlocked === true
    && /\b(?:safety|review|would not select|would not start|blocked)\b/i.test(input.answerText);
  const enough = requiredCount === 0 || validOptions.length >= requiredCount || blockedExplanation;
  const reasoned = blockedExplanation || (validOptions.length > 0 && validOptions.every((option) => option.reason.trim().length >= 12));
  return [
    result("EVIDENCE_COVERAGE", enough ? 1 : ratio(validOptions.length, requiredCount), enough ? [] : ["insufficient_grounded_options"]),
    result("REASONING", Number(reasoned), reasoned ? [] : ["option_reasoning_missing"]),
  ];
}

function memberContextValidator(input: CoachTaskValidationInput) {
  const context = input.memberContext;
  const values = [
    ...context.goals.saved.value.map((goal) => goal.label),
    ...context.goals.blueprint.value,
    context.activePractice.value?.actionLabel ?? null,
    context.activePractice.value?.minimumVersion ?? null,
    ...allRegimen(context).map((item) => item.name),
    ...(context.healthProfile.value?.conditions ?? []),
    ...(context.blueprint.value?.priorities ?? []).map((priority) => priority.label),
  ].filter((value): value is string => Boolean(value?.trim()));
  if (!values.length) return result("MEMBER_CONTEXT_USE", 1);
  const sourceIds = input.structuredAnswer?.sourceIds ?? [];
  const groundedSource = sourceIds.some((id) => [
    "current_routine", "health_profile", "goals", "recent_check_ins", "current_blueprint", "weekly_practice",
  ].includes(id));
  const exactValue = values.some((value) => containsValue(input.answerText, value));
  const memberLanguage = /\b(?:your|you|recorded|current|recent|already)\b/i.test(input.answerText);
  const passed = exactValue || (groundedSource && memberLanguage);
  return result("MEMBER_CONTEXT_USE", Number(passed), passed ? [] : ["relevant_member_context_not_used"]);
}

function requestsMemberReportedContext(question: string) {
  return /\b(?:saved|recent|today'?s?)\s+(?:check[- ]?in|context|note|reflection)s?\b/i.test(question)
    || /\b(?:member[- ]reported context|what i (?:recorded|shared|noted))\b/i.test(question);
}

function memberReportedContextValidator(input: CoachTaskValidationInput) {
  if (!requestsMemberReportedContext(input.question)) return result("MEMBER_REPORTED_CONTEXT_USE", 1);
  const notes = input.memberContext.recentCheckIns.value
    .map((item) => item.memberReportedContext)
    .filter((value): value is string => Boolean(value?.trim()));
  if (!notes.length) return result("MEMBER_REPORTED_CONTEXT_USE", 0, ["member_reported_context_missing"]);

  const contextTerms = [...new Set(notes.flatMap((note) => normalized(note).split(" ")))]
    .filter((term) => term.length >= 4 && !STOP_WORDS.has(term) && !["today", "test", "that", "this"].includes(term));
  const answer = normalized(input.answerText);
  const usesReportedDetail = contextTerms.some((term) => answer.includes(term));
  const citesCheckIns = input.structuredAnswer?.sourceIds.includes("recent_check_ins") === true;
  const passed = usesReportedDetail && citesCheckIns;
  return result(
    "MEMBER_REPORTED_CONTEXT_USE",
    Number(passed),
    passed ? [] : [!citesCheckIns ? "recent_check_ins_source_missing" : "member_reported_detail_not_used"],
  );
}

function generalValidators(input: CoachTaskValidationInput) {
  const structured = input.structuredAnswer;
  const hasReason = Boolean(structured?.recommendation?.reason)
    || Boolean(structured?.options.some((option) => option.reason.length >= 12))
    || input.answerText.trim().length >= 80;
  const actionable = Boolean(structured?.nextStep?.trim().length && structured.nextStep.trim().length >= 8)
    || /\b(?:next step|try|review|record|choose|track|keep)\b/i.test(input.answerText);
  return [
    result("REASONING", Number(hasReason), hasReason ? [] : ["reasoning_missing"]),
    result("ACTIONABILITY", Number(actionable), actionable ? [] : ["actionable_next_step_missing"]),
  ];
}

export function validateCoachTaskSuccess(input: CoachTaskValidationInput): CoachTaskSuccessReport {
  const validators: CoachTaskValidatorResult[] = [];
  const structurePass = input.answerText.trim().length >= 12
    && input.answerText.length <= 6000
    && !/^\s*[{[]/.test(input.answerText)
    && !/```/.test(input.answerText);
  validators.push(result("STRUCTURE", Number(structurePass), structurePass ? [] : ["readable_bounded_answer_required"]));

  if (REGIMEN_LOOKUP_INTENTS.has(input.route.intent)) validators.push(...regimenValidators(input));
  else if (input.route.intent === "SAFETY_REVIEW") validators.push(...safetyValidators(input));
  else if (input.route.intent === "BEHAVIORAL_COACHING") validators.push(activePracticeValidator(input), timeHorizonValidator(input));
  else if (input.route.intent === "PRIORITIZATION") validators.push(priorityValidator(input));
  else if (input.route.intent === "MISSING_CONTEXT") validators.push(missingContextValidator(input));
  else if (input.route.intent === "PROGRESS_COACHING") {
    validators.push(...(nextWeekPracticeRequest(input) ? nextWeekPracticeValidators(input) : progressValidators(input)));
  }
  else if (input.route.intent === "OUT_OF_SCOPE") validators.push(outOfScopeValidator(input));
  else if (["EVIDENCE_COMPARISON", "OPTION_COMPARISON"].includes(input.route.intent)) validators.push(...evidenceValidators(input));
  else if (input.route.intent === "PERSONALIZED_RECOMMENDATION") {
    validators.push(memberContextValidator(input), memberReportedContextValidator(input), ...generalValidators(input));
    if (input.evidenceOptionNames?.length) validators.push(...evidenceValidators(input, 1));
  }
  else validators.push(...generalValidators(input));

  validators.push(constraintValidator(input));
  if (input.safetyChecked === false) validators.push(result("SAFETY_FINDINGS", 0, ["required_safety_check_incomplete"]));

  const missingRequirements = [...new Set(validators.flatMap((item) => item.missingRequirements))];
  const constraintViolations = [...new Set(validators.flatMap((item) => item.constraintViolations))];
  const failedValidators = validators.filter((item) => !item.passed).map((item) => item.validator);
  const completeness = validators.reduce((sum, item) => sum + item.completeness, 0) / validators.length;
  const factualValidators = validators.filter((item) => [
    "REGIMEN_COVERAGE", "REQUESTED_FIELDS", "TYPE_EXCLUSIONS", "SAFETY_FINDINGS",
    "SAFETY_REASONING", "PRIORITY_ALIGNMENT", "MISSING_CONTEXT_ACCURACY", "PROGRESS_METRICS",
    "CAUSAL_BOUNDARY", "MEMBER_CONTEXT_USE", "MEMBER_REPORTED_CONTEXT_USE", "EVIDENCE_COVERAGE",
  ].includes(item.validator));
  const factualCoverage = factualValidators.length
    ? factualValidators.reduce((sum, item) => sum + item.completeness, 0) / factualValidators.length
    : completeness;
  return {
    intent: input.route.intent,
    passed: failedValidators.length === 0,
    score: Math.round(completeness * 100),
    completeness: Number(completeness.toFixed(3)),
    factualCoverage: Number(factualCoverage.toFixed(3)),
    validators,
    failedValidators,
    missingRequirements,
    constraintViolations,
  };
}
