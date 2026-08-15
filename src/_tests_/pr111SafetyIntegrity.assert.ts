import assert from "node:assert/strict";
import {
  evaluateSafetyCandidates,
  safetySectionFromEvaluation,
  type InteractionRow,
  type SafetyCandidate,
  type SafetyRuleRow,
} from "../lib/safetyEngine.ts";
import { classifyCoachRequest } from "../lib/contextualCoach.ts";

const vitaminDSource = {
  source_label: "NIH Office of Dietary Supplements: Vitamin D Fact Sheet for Health Professionals",
  source_url: "https://ods.od.nih.gov/factsheets/VitaminD-HealthProfessional/",
  source_type: "government_reference",
  exact_ingredient_form: "Vitamin D3 (cholecalciferol)",
  interaction_mechanism: "1 mcg vitamin D equals 40 IU.",
  severity_rationale: "Amounts above the adult UL require review.",
  confidence: "high",
  user_qualification: "A clinician-directed regimen may require a different monitored plan.",
  rule_version: "safety-data-v2",
  provenance_status: "reviewed",
} as const;

const interactions: InteractionRow[] = [
  { ingredient: "Vitamin D3", binds_thyroid_meds: false, ...vitaminDSource },
  {
    ingredient: "Probiotic (Lacto/Bifido blend)",
    binds_thyroid_meds: false,
    antibiotics_interaction: true,
    immunocompromised_caution: true,
    source_label: "NCCIH: Probiotics, What Do We Know?",
    source_url: "https://www.nccih.nih.gov/health/probiotics-usefulness-and-safety",
    source_type: "government_reference",
    exact_ingredient_form: "Lactobacillus/Bifidobacterium blend; strain details not recorded",
    confidence: "moderate",
    provenance_status: "reviewed",
    rule_version: "safety-data-v2",
  },
  {
    ingredient: "Magnesium (glycinate)",
    binds_thyroid_meds: true,
    sep_hours_thyroid: 4,
    source_label: "ThyroMag Trial",
    source_url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12605969/",
    source_type: "peer_reviewed",
    exact_ingredient_form: "Magnesium (glycinate)",
    interaction_mechanism: "Concurrent magnesium can reduce levothyroxine absorption; evidence varies by formulation.",
    confidence: "moderate",
    user_qualification: "The direct trial studied citrate and aspartate, not glycinate.",
    provenance_status: "reviewed",
    rule_version: "safety-data-v2",
  },
  { ingredient: "Omega-3", anticoagulants_bleeding_risk: true },
];

const vitaminDRule: SafetyRuleRow = {
  rule_id: "UL_VITAMIN_D_Adults",
  rule_type: "UL",
  entity_a_name: "Vitamin D3",
  max_daily_amount: 100,
  unit: "mcg",
  message: "The adult upper intake level is 100 mcg (4,000 IU) daily.",
  ...vitaminDSource,
};

const evaluateVitaminD = (candidate: SafetyCandidate, rule: SafetyRuleRow = vitaminDRule) => evaluateSafetyCandidates(
  {},
  [candidate],
  { interactions, rules: [rule] },
);

const vitaminD5000 = evaluateVitaminD({ name: "Vitamin D3", dose: "5000 IU", is_current: false });
assert.equal(vitaminD5000.status, "blocked", "5,000 IU must compare against 100 mcg and exceed the adult UL.");
assert.equal(vitaminD5000.findings[0]?.doseComparison?.recordedDose, "5000 IU");
assert.equal(vitaminD5000.findings[0]?.doseComparison?.normalizedAmount, 125);
assert.equal(vitaminD5000.findings[0]?.doseComparison?.normalizedUnit, "mcg");
assert.equal(vitaminD5000.findings[0]?.doseComparison?.thresholdInRecordedUnit, 4_000, "The deterministic answer must say 5,000 IU is above 4,000 IU, never below it.");
assert.equal(evaluateVitaminD({ name: "Vitamin D3", dose: "4000 IU", is_current: false }).status, "clear", "4,000 IU must equal, not exceed, 100 mcg.");
assert.equal(evaluateVitaminD(
  { name: "Vitamin D3", dose: "125 mcg", is_current: false },
  { ...vitaminDRule, max_daily_amount: 4_000, unit: "IU" },
).status, "blocked", "125 mcg must compare as 5,000 IU when the rule is stored in IU.");

const unsupported = evaluateVitaminD({ name: "Vitamin D3", dose: "5000 USP", is_current: false });
assert.equal(unsupported.status, "review", "Unsupported units must not be guessed or silently cleared.");
assert.equal(unsupported.findings[0]?.code, "dose_unit_not_comparable");
assert.match(unsupported.findings[0]?.message ?? "", /did not guess a conversion/i);

const thyroidVitaminD = evaluateSafetyCandidates(
  { medications: ["Levothyroxine"] },
  [{ name: "Vitamin D3", dose: "2000 IU", is_current: true }],
  { interactions, rules: [vitaminDRule] },
);
assert.equal(thyroidVitaminD.status, "clear", "Plain Vitamin D3 must not create a thyroid-spacing false positive.");

const thyroidProbiotic = evaluateSafetyCandidates(
  { medications: ["Levothyroxine"] },
  [{ name: "Probiotic (Lacto/Bifido blend)", is_current: true }],
  { interactions, rules: [] },
);
assert.equal(thyroidProbiotic.status, "clear", "A probiotic blend must not create a general thyroid-spacing false positive.");

const immuneProbiotic = evaluateSafetyCandidates(
  { conditions: ["Immunocompromised"] },
  [{ name: "Probiotic (Lacto/Bifido blend)", is_current: true }],
  { interactions, rules: [] },
);
assert.equal(immuneProbiotic.findings[0]?.code, "immune_caution", "Correcting the thyroid flag must not erase the evidence-backed immune-context review.");

const magnesium = evaluateSafetyCandidates(
  { medications: ["Levothyroxine"] },
  [{ name: "Magnesium glycinate", dose: "200 mg elemental magnesium", is_current: true }],
  {
    interactions,
    rules: [{
      rule_type: "SPACING",
      entity_a_name: "Levothyroxine",
      message: "Separate magnesium from levothyroxine by at least 4 hours.",
    }],
  },
);
assert.equal(magnesium.findings.length, 1, "One underlying magnesium timing concern must render once.");
assert.equal(magnesium.findings[0]?.evidence?.confidence, "moderate");
assert.match(magnesium.findings[0]?.evidence?.qualification ?? "", /not glycinate/i, "Form-specific uncertainty must remain visible.");

const multiple = evaluateSafetyCandidates(
  { medications: ["Eliquis"], procedures: ["Surgery next week"] },
  [{ name: "Omega-3", is_current: false }],
  { interactions, rules: [] },
);
assert.equal(multiple.findings.length, 2, "Distinct bleeding and procedure findings must both remain available.");

const clinicianDirected = evaluateVitaminD({
  name: "Vitamin D3",
  dose: "5000 IU",
  is_current: true,
  instruction_authority: "clinician",
});
assert.equal(clinicianDirected.status, "review", "A clinician-directed current dose above the general UL must be reviewed, not app-blocked.");
assert.match(clinicianDirected.findings[0]?.message ?? "", /Do not change it from this app warning alone/i);

const section = safetySectionFromEvaluation(clinicianDirected);
assert.match(section, /What to do:/);
assert.match(section, /Why this appeared:/);
assert.match(section, /Confidence: high/);
assert.match(section, /NIH Office of Dietary Supplements/);
assert.match(section, /Important context:/);

for (const question of [
  "Is my current Vitamin D dose above the general upper-intake threshold?",
  "Review magnesium glycinate with my thyroid medication.",
  "Do I need to separate Vitamin D or my probiotic from levothyroxine?",
]) {
  assert.equal(classifyCoachRequest(question).intent, "SAFETY_REVIEW", `Screenshot regression must use the deterministic safety path: ${question}`);
}

console.log("PR111 unit-aware, evidence-grounded safety scenarios passed.");
