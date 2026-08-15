import assert from "node:assert/strict";
import {
  applySafetyEvaluationToMarkdown,
  evaluateSafetyCandidates,
  unavailableSafetyEvaluation,
  type InteractionRow,
  type SafetyContext,
} from "../lib/safetyEngine.ts";

const interactions: InteractionRow[] = [
  { ingredient: "Ashwagandha (KSM-66 or similar)", pregnancy_caution: false, sedatives_additive: true },
  { ingredient: "Ashwagandha", pregnancy_caution: true },
  { ingredient: "Omega-3 (EPA+DHA)", anticoagulants_bleeding_risk: true },
  { ingredient: "Berberine", diabetes_meds_additive: true },
  { ingredient: "Magnesium (glycinate)", binds_thyroid_meds: true, sep_hours_thyroid: 4, kidney_disease_caution: true },
  { ingredient: "Creatine monohydrate", kidney_disease_caution: true },
  { ingredient: "Vitamin A", liver_disease_caution: true },
  { ingredient: "Melatonin", sedatives_additive: true },
  { ingredient: "Vitamin D3" },
  { ingredient: "Collagen peptides" },
];

const run = (context: SafetyContext, name: string) => evaluateSafetyCandidates(
  context,
  [{ name, is_current: false }],
  { interactions, rules: [] },
);

assert.equal(run({ pregnant: true }, "Ashwagandha").status, "blocked", "Pregnancy caution must block a proposed item.");
assert.equal(run({ allergies: ["Magnesium"] }, "Magnesium glycinate").status, "blocked", "A matching reported allergy must block a proposed item.");
assert.equal(run({ procedures: ["Colonoscopy procedure next week"] }, "Omega-3").status, "blocked", "A bleeding-risk item must stop for procedure review.");
assert.equal(run({ medications: ["Eliquis"] }, "Omega-3").status, "blocked", "Anticoagulant combinations must stop for coordinated review.");
assert.equal(run({ medications: ["Metformin"] }, "Berberine").status, "review", "Additive glucose lowering must require review.");
assert.match(run({ medications: ["Levothyroxine"] }, "Magnesium glycinate").findings[0].message, /4 hours/, "Thyroid spacing must include the structured interval.");
assert.equal(run({ conditions: ["Chronic kidney disease"] }, "Creatine monohydrate").status, "review", "Kidney context must require review.");
assert.equal(run({ conditions: ["Liver impairment"] }, "Vitamin A").status, "review", "Liver context must require review.");
assert.equal(run({ medications: ["Lunesta"] }, "Melatonin").status, "review", "Additive sedation must require review.");
assert.equal(run({ medications: ["BrandNewMedication"] }, "Vitamin D3").status, "review", "An unclassified medication must fail closed.");
assert.equal(run({}, "Collagen peptides").status, "clear", "A matched item without a contextual flag may remain qualified clear.");
assert.equal(run({}, "Unmapped compound").status, "review", "A missing interaction record must fail closed.");

const unavailable = unavailableSafetyEvaluation([{ name: "Vitamin D3", is_current: false }]);
assert.equal(unavailable.complete, false, "A source failure must be explicit.");
assert.equal(unavailable.status, "review", "A source failure must never produce a clear result.");

const currentFinding = evaluateSafetyCandidates(
  { medications: ["Levothyroxine"] },
  [
    { name: "Magnesium glycinate", is_current: true },
    { name: "Unmapped compound", is_current: false },
  ],
  { interactions, rules: [] },
);
const report = [
  "## Your Blueprint Recommendations",
  "",
  "| Rank | Supplement | Status | Why it Matters |",
  "| --- | --- | --- | --- |",
  "| 1 | Magnesium glycinate | Current - optimize | Existing routine |",
  "| 2 | Unmapped compound | New - consider | Proposed option |",
  "",
  "## Contraindications & Med Interactions",
  "",
  "- **No material flags identified:** Placeholder.",
  "",
  "## Current Stack",
  "",
  "| Current Item | Type | Purpose | Dosage | Timing |",
  "| --- | --- | --- | --- | --- |",
  "| Levothyroxine | Medication | Thyroid | Keep prescribed dose | Keep prescribed timing |",
].join("\n");
const patched = applySafetyEvaluationToMarkdown(report, currentFinding);
assert.match(patched, /\| 1 \| Magnesium glycinate \| Current - optimize \|/, "Current item status and instructions must remain unchanged.");
assert.match(patched, /\| 2 \| Unmapped compound \| Clinician review \|/, "A proposed item that cannot be cleared must not remain active.");
assert.match(patched, /Clinician review: Unmapped compound/, "The customer-visible safety section must use the canonical structured finding.");
assert.doesNotMatch(patched, /Placeholder/, "The structured safety section must replace generated placeholder content.");

const duplicateCandidates = evaluateSafetyCandidates(
  {},
  [
    { name: "Magnesium Glycinate", is_current: false },
    { name: "magnesium bisglycinate", is_current: true },
  ],
  { interactions: [], rules: [] },
);
assert.equal(duplicateCandidates.candidates.length, 1, "Canonical duplicate candidates should be evaluated once");
assert.equal(duplicateCandidates.findings.length, 0, "A missing library row should not warn repeatedly about an existing routine item");

const magnesiumUpperLimitRule = {
  rule_type: "UL",
  entity_a_name: "Magnesium",
  max_daily_amount: 350,
  unit: "mg",
  message: "Do not exceed 350 mg/day of magnesium from supplements.",
  severity: "danger",
};
const ambiguousCompoundDose = evaluateSafetyCandidates(
  {},
  [{ name: "Magnesium Threonate", dose: "2000mg compound weight; elemental amount not recorded", is_current: true }],
  { interactions: [], rules: [magnesiumUpperLimitRule] },
);
assert.equal(ambiguousCompoundDose.status, "review", "A magnesium compound weight must not be treated as an elemental overdose");
assert.equal(ambiguousCompoundDose.findings[0]?.code, "dose_basis_unclear");
assert.match(ambiguousCompoundDose.findings[0]?.message ?? "", /elemental magnesium/i);

const explicitElementalDose = evaluateSafetyCandidates(
  {},
  [{ name: "Magnesium Threonate", dose: "400 mg elemental magnesium", is_current: true }],
  { interactions: [], rules: [magnesiumUpperLimitRule] },
);
assert.equal(explicitElementalDose.status, "blocked", "An explicitly elemental magnesium dose above the limit must remain blocked");
assert.equal(explicitElementalDose.findings[0]?.code, "upper_limit");

const groupedSafety = evaluateSafetyCandidates(
  { medications: ["Levothyroxine"] },
  [{ name: "Magnesium Glycinate", dose: "210 mg", is_current: true }],
  {
    interactions,
    rules: [{
      rule_type: "SPACING",
      entity_a_name: "Levothyroxine",
      message: "Separate calcium, iron, and magnesium supplements by at least 4 hours.",
    }],
  },
);
const groupedSection = applySafetyEvaluationToMarkdown(report, groupedSafety);
assert.equal((groupedSection.match(/Clinician review: Magnesium Glycinate:/g) ?? []).length, 1, "Distinct concerns for one item should render under one heading");
assert.match(groupedSection, /thyroid medication by at least 4 hours/);
assert.doesNotMatch(groupedSection, /calcium, iron, and magnesium supplements/, "A specific evidence-backed finding must suppress the duplicate generic spacing rule.");

console.log("Safety engine assertions passed.");
