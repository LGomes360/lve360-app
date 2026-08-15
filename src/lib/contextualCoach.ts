export const COACH_PROMPT_VERSION = "contextual-coach-v4";

export type CoachIntent =
  | "GENERAL_EDUCATION"
  | "PERSONALIZED_RECOMMENDATION"
  | "CURRENT_REGIMEN_LOOKUP"
  | "MEDICATION_LOOKUP"
  | "HORMONE_LOOKUP"
  | "SUPPLEMENT_LOOKUP"
  | "CURRENT_PLAN_LOOKUP"
  | "SAFETY_REVIEW"
  | "BEHAVIORAL_COACHING"
  | "PRIORITIZATION"
  | "MISSING_CONTEXT"
  | "EVIDENCE_COMPARISON"
  | "OUT_OF_SCOPE"
  | "OPTION_COMPARISON"
  | "PLAN_EXPLANATION"
  | "TIMING_OR_DOSING"
  | "PROGRESS_COACHING"
  | "REQUEST_TO_CHANGE_RECORD"
  | "POTENTIAL_MEDICAL_RED_FLAG";

export type CoachRegimenKind = "medication" | "hormone" | "supplement" | "endocrine_active_supplement";

export type CoachConstraints = {
  preserveMedicationPlan: boolean;
  preserveHormonePlan: boolean;
  preserveSupplementPlan: boolean;
};

export type CoachRoutingDecision = {
  intent: CoachIntent;
  constraints: CoachConstraints;
  requestedRegimenKinds: CoachRegimenKind[];
};

export type StoredCoachIntent =
  | "GENERAL_EDUCATION"
  | "PERSONALIZED_RECOMMENDATION"
  | "CURRENT_PLAN_LOOKUP"
  | "OPTION_COMPARISON"
  | "PLAN_EXPLANATION"
  | "TIMING_OR_DOSING"
  | "PROGRESS_COACHING"
  | "REQUEST_TO_CHANGE_RECORD"
  | "POTENTIAL_MEDICAL_RED_FLAG";

export function storedCoachIntent(intent: CoachIntent): StoredCoachIntent {
  if (intent === "CURRENT_REGIMEN_LOOKUP" || intent === "MEDICATION_LOOKUP" || intent === "HORMONE_LOOKUP" || intent === "SUPPLEMENT_LOOKUP") {
    return "CURRENT_PLAN_LOOKUP";
  }
  if (intent === "SAFETY_REVIEW") return "PLAN_EXPLANATION";
  if (intent === "BEHAVIORAL_COACHING" || intent === "PRIORITIZATION" || intent === "MISSING_CONTEXT") return "PROGRESS_COACHING";
  if (intent === "EVIDENCE_COMPARISON") return "OPTION_COMPARISON";
  if (intent === "OUT_OF_SCOPE") return "GENERAL_EDUCATION";
  return intent;
}

export type ProposedCoachOption = {
  name: string;
  fit: "strong" | "neutral" | "weak";
  reason: string;
};

export type StructuredCoachAnswer = {
  intent: CoachIntent;
  directAnswer: string;
  options: ProposedCoachOption[];
  recommendation: { candidate: string; reason: string; trialPeriodDays: number | null; metrics: string[] } | null;
  nextStep: string;
  sourceIds: string[];
};

export type CoachQualityReport = {
  directly_answered_question: boolean;
  used_relevant_user_context: boolean;
  provided_concrete_information: boolean;
  provided_reasoning_or_why: boolean;
  evidence_quality_appropriate: boolean;
  safety_checked: boolean;
  actionable_next_step: boolean;
  excessive_referral_language: boolean;
  unsupported_claims: boolean;
  record_only_failure: boolean;
  passed: boolean;
  score: number;
};

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
  response_source: "ai" | "deterministic" | "fallback" | "safety" | "budget";
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

function explicitCoachConstraints(question: string): CoachConstraints {
  const value = question.toLowerCase();
  const withoutChange = /\b(?:without|do not|don't|not)\b[\s\S]{0,50}\b(?:chang|adjust|start|stop|add|remove|switch)/.test(value)
    || /\bkeep\b[\s\S]{0,40}\b(?:unchanged|the same)/.test(value);
  const allRegimen = withoutChange && /\b(?:routine|regimen|stack|anything i take)\b/.test(value);
  return {
    preserveMedicationPlan: allRegimen || (withoutChange && /\b(?:medications?|meds?|medicines?|prescriptions?|prescribed drugs?)\b/.test(value)),
    preserveHormonePlan: allRegimen || (withoutChange && /\bhormon(?:e|es|s)?\b/.test(value)),
    preserveSupplementPlan: allRegimen || (withoutChange && /\b(?:supplements?|supplments?|vitamins?|minerals?|stack)\b/.test(value)),
  };
}

function requestedRegimenKinds(question: string): CoachRegimenKind[] {
  const value = question.toLowerCase();
  const result: CoachRegimenKind[] = [];
  if (/\b(?:medications?|meds?|medicines?|prescriptions?|prescribed drugs?)\b/.test(value)) result.push("medication");
  if (/\bhormon(?:e|es|s)?\b/.test(value)) result.push("hormone");
  if (/\b(?:supplements?|supplments?|vitamins?|minerals?)\b/.test(value)) result.push("supplement", "endocrine_active_supplement");
  return [...new Set(result)];
}

export function classifyCoachRequest(question: string): CoachRoutingDecision {
  const value = question.toLowerCase();
  const constraints = explicitCoachConstraints(question);
  const requestedKinds = requestedRegimenKinds(question);
  const route = (intent: CoachIntent, kinds: CoachRegimenKind[] = requestedKinds): CoachRoutingDecision => ({
    intent,
    constraints,
    requestedRegimenKinds: kinds,
  });
  if (/\b(suicid|kill myself|overdose|chest pain|can(?:not|'t) breathe|stroke|severe allergic|anaphyl|fainted|unconscious|medical emergency|vomiting blood|face (?:is )?swelling|tongue (?:is )?swelling|black stools?|severe confusion)\b/.test(value)) {
    return route("POTENTIAL_MEDICAL_RED_FLAG");
  }
  if (/\b(?:add|save|record|remove|delete)\b[\s\S]{0,80}\b(?:my|the)\s+(?:stack|routine|record|reminder|medication|hormone|supplement)\b/.test(value)
    || /\b(?:add|remove|delete)\b[\s\S]{0,60}\b(?:to|from)\s+(?:my\s+)?(?:stack|routine|records?)\b/.test(value)) {
    return route("REQUEST_TO_CHANGE_RECORD");
  }
  if (/\b(?:capital of|president of|prime minister of|weather|stock price|sports score|who won|recipe for|write (?:me )?a poem)\b/.test(value)) {
    return route("OUT_OF_SCOPE", []);
  }
  if (/\b(?:clinician|pharmacist|pharmasist|doctor|professional)\b[\s\S]{0,50}\b(?:review|discuss|check|attention)\b/.test(value)
    || /\b(?:need|needs|requiring?|deserve|flagged? for)\b[\s\S]{0,50}\b(?:clinician|pharmacist|pharmasist|doctor|professional)\b/.test(value)
    || /\b(?:safety|interaction|contraindication|conflict|warning)s?\b[\s\S]{0,50}\b(?:routine|regimen|stack|review|item)\b/.test(value)
    || /\b(?:review|separate|spacing|interaction|interact)\b[\s\S]{0,100}\b(?:thyroid|levothyroxine|medication)\b/.test(value)
    || /\b(?:upper[- ]?intake|upper limit|general threshold)\b/.test(value)) {
    return route("SAFETY_REVIEW");
  }
  if (/\b(?:what|which)\b[\s\S]{0,80}\b(?:missing|incomplete|not (?:saved|recorded)|need(?:ed)? from me)\b/.test(value)
    || /\b(?:missing|incomplete)\b[\s\S]{0,50}\b(?:profile|context|information|data|record)\b/.test(value)) {
    return route("MISSING_CONTEXT", []);
  }
  if (/\b(?:highest[- ]value|most important|best next|single (?:best|most useful)|prioriti[sz]e|focus on this week|what should i focus)\b/.test(value)) {
    return route("PRIORITIZATION", []);
  }
  if (/\b(?:slept poorly|poor sleep|bad night|rough night|low energy|hard day|off track|missed my|make (?:it|this) easier|adjust tomorrow|adjust today)\b/.test(value)
    || /\b(?:how (?:can|should) i|help me)\b[\s\S]{0,70}\b(?:sleep|eat|exercise|move|walk|meditat|recover|habit|practice|routine tomorrow)\b/.test(value)) {
    return route("BEHAVIORAL_COACHING", []);
  }
  if (/\b(?:what|which|list|show|am i|do i)\b[\s\S]{0,70}\b(?:taking|take|currently|current|recorded|in my stack|in my routine)\b/.test(value)
    || /\bis\s+[a-z0-9 -]+\s+(?:already\s+)?in my (?:stack|routine|records?)\b/.test(value)
    || /\b(?:show|list)\b[\s\S]{0,50}\b(?:medications?|meds?|hormon(?:e|es|s)?|supplements?|supplments?)\b/.test(value)) {
    if (requestedKinds.length === 1 && requestedKinds[0] === "medication") return route("MEDICATION_LOOKUP");
    if (requestedKinds.length === 1 && requestedKinds[0] === "hormone") return route("HORMONE_LOOKUP");
    if (requestedKinds.length && requestedKinds.every((kind) => kind === "supplement" || kind === "endocrine_active_supplement")) {
      return route("SUPPLEMENT_LOOKUP");
    }
    return route("CURRENT_REGIMEN_LOOKUP", requestedKinds.length ? requestedKinds : ["medication", "hormone", "supplement", "endocrine_active_supplement"]);
  }
  if (/\b(?:compare|versus|vs\.?|difference between|better for me|or)\b/.test(value)
    && /\b(?:supplement|vitamin|mineral|magnesium|glycine|melatonin|theanine|creatine|coq10|b[- ]?12|omega[- ]?3|ashwagandha)\b/.test(value)) {
    return route("EVIDENCE_COMPARISON", ["supplement", "endocrine_active_supplement"]);
  }
  if (/\b(?:when should|what time|morning or evening|with food|without food|dose|dosage|how much|timing|space|spacing)\b/.test(value)) {
    return route("TIMING_OR_DOSING");
  }
  if (/\b(?:why|explain|what does|how does)\b[\s\S]{0,80}\b(?:blueprint|plan|priority|recommendation|routine)\b/.test(value)) {
    return route("PLAN_EXPLANATION");
  }
  if (/\b(?:this week|progress|trend|recent|check[- ]?ins?|small win|next habit|weekly practice|focus on)\b/.test(value)) {
    return route("PROGRESS_COACHING", []);
  }
  if (/\b(?:for me|my\s+(?:sleep|energy|goals?|stack|medications?|routine)|should i|what should i try|best for my|makes? sense for me|fit my)\b/.test(value)) {
    return route("PERSONALIZED_RECOMMENDATION");
  }
  return route("GENERAL_EDUCATION", []);
}

export function classifyCoachIntent(question: string): CoachIntent {
  return classifyCoachRequest(question).intent;
}

export type CoachSafetyBoundary = "emergency" | "diagnosis" | "regimen_change" | null;

export function coachSafetyBoundary(question: string): CoachSafetyBoundary {
  const value = question.toLowerCase();
  if (/\b(suicid|kill myself|overdose|chest pain|can't breathe|cannot breathe|stroke|medical emergency|severe allergic|anaphyl|fainted|unconscious|vomiting blood|face (?:is )?swelling|tongue (?:is )?swelling|black stools?|severe confusion)\b/.test(value)) {
    return "emergency";
  }
  if (/\b(diagnose|diagnosis|what disease|what condition|is this cancer|do i have (?:a disease|a condition|cancer|diabetes|depression|anxiety|hypertension))\b/.test(value)) {
    return "diagnosis";
  }
  const change = /\b(start|begin|stop|quit|add|remove|increase|decrease|double|halve|change|adjust|skip|replace|switch)\b/;
  const medicationOrHormone = /\b(medication|medicine|prescription|prescribed|hormone|zepbound|insulin|thyroid|testosterone|estrogen|progesterone)\b/;
  return change.test(value) && medicationOrHormone.test(value) ? "regimen_change" : null;
}

export function coachBoundaryAnswer(boundary: Exclude<CoachSafetyBoundary, null>): string {
  if (boundary === "emergency") {
    return "This may need immediate human help. If you may be in danger or have severe symptoms, call emergency services now. In the U.S., call 911. For a mental-health crisis, call or text 988. LVE360 cannot assess an emergency.";
  }
  if (boundary === "diagnosis") {
    return "I can help you organize your recorded information and prepare questions for a qualified clinician, but I cannot diagnose a condition. If you describe what you want to understand, I can help you create a concise discussion list.";
  }
  return "I cannot direct a medication or hormone change. I can summarize what LVE360 currently records, explain the relevant evidence and safety context, and help you prepare specific questions for your clinician or healthcare provider before changing a prescribed plan.";
}

function cleanText(value: unknown, max = 1000) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function isCoachIntent(value: unknown): value is CoachIntent {
  return [
    "GENERAL_EDUCATION", "PERSONALIZED_RECOMMENDATION", "CURRENT_REGIMEN_LOOKUP",
    "MEDICATION_LOOKUP", "HORMONE_LOOKUP", "SUPPLEMENT_LOOKUP", "CURRENT_PLAN_LOOKUP",
    "SAFETY_REVIEW", "BEHAVIORAL_COACHING", "PRIORITIZATION", "MISSING_CONTEXT",
    "EVIDENCE_COMPARISON", "OUT_OF_SCOPE", "OPTION_COMPARISON", "PLAN_EXPLANATION", "TIMING_OR_DOSING",
    "PROGRESS_COACHING", "REQUEST_TO_CHANGE_RECORD", "POTENTIAL_MEDICAL_RED_FLAG",
  ].includes(String(value));
}

export function parseStructuredCoachAnswer(
  text: string,
  expectedIntent: CoachIntent,
  validSourceIds: Set<string>,
  allowedOptionNames: Set<string>,
): StructuredCoachAnswer | null {
  const candidate = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    const value = JSON.parse(candidate) as Record<string, unknown>;
    const intent = isCoachIntent(value.intent) ? value.intent : expectedIntent;
    if (intent !== expectedIntent) return null;
    const directAnswer = cleanText(value.direct_answer, 700);
    const nextStep = cleanText(value.next_step, 350);
    if (directAnswer.length < 12 || nextStep.length < 8 || !isCoachAnswerSafe(`${directAnswer} ${nextStep}`)) return null;

    const options = Array.isArray(value.options) ? value.options.flatMap((raw): ProposedCoachOption[] => {
      if (!raw || typeof raw !== "object") return [];
      const item = raw as Record<string, unknown>;
      const name = cleanText(item.name, 100);
      const reason = cleanText(item.reason, 260);
      const fit = item.fit === "strong" || item.fit === "neutral" || item.fit === "weak" ? item.fit : "neutral";
      if (!name || !reason || !allowedOptionNames.has(name.toLowerCase())) return [];
      return [{ name, fit, reason }];
    }).slice(0, 3) : [];

    const rawRecommendation = value.recommendation;
    let recommendation: StructuredCoachAnswer["recommendation"] = null;
    if (rawRecommendation && typeof rawRecommendation === "object") {
      const item = rawRecommendation as Record<string, unknown>;
      const selected = cleanText(item.candidate, 100);
      const reason = cleanText(item.reason, 400);
      const matched = options.find((option) => option.name.toLowerCase() === selected.toLowerCase());
      if (matched && reason) {
        const days = Number(item.trial_period_days);
        recommendation = {
          candidate: matched.name,
          reason,
          trialPeriodDays: Number.isFinite(days) && days >= 1 && days <= 60 ? Math.round(days) : null,
          metrics: Array.isArray(item.metrics)
            ? item.metrics.map((metric) => cleanText(metric, 80)).filter(Boolean).slice(0, 3)
            : [],
        };
      }
    }
    const sourceIds = Array.isArray(value.source_ids)
      ? [...new Set(value.source_ids.filter((id): id is string => typeof id === "string" && validSourceIds.has(id)))]
      : [];
    return { intent, directAnswer, options, recommendation, nextStep, sourceIds };
  } catch {
    return null;
  }
}

/**
 * @deprecated PR107 compatibility helper. Production coaching uses
 * validateCoachTaskSuccess so the score reflects the requested job.
 */
export function assessCoachAnswerQuality(input: {
  answer: StructuredCoachAnswer;
  supplementQuestion: boolean;
  safetyChecked: boolean;
  usedMemberContext: boolean;
  allCandidatesBlocked?: boolean;
}): CoachQualityReport {
  const combined = `${input.answer.directAnswer} ${input.answer.options.map((option) => option.reason).join(" ")} ${input.answer.nextStep}`;
  const referralCount = (combined.match(/clinician|pharmacist|professional|doctor/gi) ?? []).length;
  const recordOnlyFailure = /(?:blueprint|records?|saved information) (?:does not|doesn't|do not|don't) (?:specify|contain|include|answer)/i.test(combined)
    && input.answer.options.length === 0;
  const checks = {
    directly_answered_question: input.answer.directAnswer.length >= 12,
    used_relevant_user_context: !input.usedMemberContext || /\b(?:your|you|recorded|current|recent|already)\b/i.test(combined),
    provided_concrete_information: !input.supplementQuestion || input.answer.options.length > 0 || input.allCandidatesBlocked === true,
    provided_reasoning_or_why: input.answer.options.some((option) => option.reason.length >= 12)
      || Boolean(input.answer.recommendation?.reason)
      || (!input.supplementQuestion && input.answer.directAnswer.length >= 40),
    evidence_quality_appropriate: !input.supplementQuestion || input.answer.options.length > 0 || input.allCandidatesBlocked === true,
    safety_checked: input.safetyChecked,
    actionable_next_step: input.answer.nextStep.length >= 8,
    excessive_referral_language: referralCount >= 3 && referralCount * 35 > combined.split(/\s+/).length,
    unsupported_claims: false,
    record_only_failure: recordOnlyFailure,
  };
  const positive = [
    checks.directly_answered_question, checks.used_relevant_user_context, checks.provided_concrete_information,
    checks.provided_reasoning_or_why, checks.evidence_quality_appropriate, checks.safety_checked,
    checks.actionable_next_step,
  ].filter(Boolean).length;
  const passed = positive >= 6
    && !checks.excessive_referral_language
    && !checks.unsupported_claims
    && !checks.record_only_failure
    && (!input.supplementQuestion || checks.provided_concrete_information);
  return { ...checks, passed, score: Math.round((positive / 7) * 100) };
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
  if (/\b(?:treats?|cures?|prevents?|manages?)\b[^.]{0,80}\b(?:disease|cancer|diabetes|depression|anxiety|hypertension|infection)\b/.test(value)) return false;
  if (/\b(?:completely|absolutely|guaranteed|proven) safe\b|\bno risk\b/.test(value)) return false;
  if (/https?:\/\/|\bdoi\s*:|\bpmid\s*:/i.test(answer)) return false;
  const directive = /\b(?:you should|i recommend|go ahead and|please)\s+(?:start|begin|stop|quit|add|remove|increase|decrease|double|halve|change|adjust|skip|replace|switch)\b/;
  const prescribedItem = /\b(medication|medicine|prescription|prescribed|hormone|zepbound|insulin|thyroid|testosterone|estrogen|progesterone)\b/;
  return !(directive.test(value) && prescribedItem.test(value));
}

export function coachSuggestedPrompts(page: CoachPage): string[] {
  const common = "What is the smallest useful step I can take today?";
  const prompts: Record<CoachPage, string[]> = {
    today: [common, "How can I make today's weekly practice easier to complete?"],
    routine: ["What am I currently taking at night?", "Does anything in my routine deserve a closer safety review?"],
    blueprint: ["What are the most important themes in my current Blueprint?", "Which Blueprint option best fits my current routine?"],
    journey: ["What pattern can I cautiously learn from my recent progress?", "What small win should I build on next?"],
    review: ["Help me reflect on what made this week easier or harder.", "What is a sensible experiment for next week?"],
    settings: ["Which information should I review so LVE360 stays useful?", common],
    other: [common, "What information in LVE360 should I review first?"],
  };
  return prompts[page];
}
