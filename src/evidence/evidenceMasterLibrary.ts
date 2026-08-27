export type EvidenceStrength = "Strong" | "Moderate" | "Emerging" | "Limited" | "Mixed" | "Insufficient";

export type EvidenceTopic = "sleep" | "stress" | "recovery" | "energy" | "exercise" | "focus" | "cognition" | "heart";

export type SupplementDoseGuidance = {
  name: string;
  startingDose: string;
  typicalRange: string;
  timing: string;
  food: string;
  adjustment?: string;
  guardrail?: string;
  caution?: string;
  evidenceLabel: string;
  lastReviewed: string;
};

export type EvidenceMasterEntry = {
  id: string;
  name: string;
  aliases: RegExp;
  citationLookup: string;
  topics: EvidenceTopic[];
  evidenceStrength?: EvidenceStrength;
  bestFit?: string;
  evidenceSummary?: string;
  lastReviewed: string;
  reviewCadenceDays: number;
  safetyTopics: string[];
  safetySummary: string;
  doseGuidance?: SupplementDoseGuidance;
};

export const EVIDENCE_LIBRARY_MANIFEST = {
  version: "2026-08-27",
  clinicalEvidenceSource: "src/evidence/evidence_index_top3.json",
  safetyRuleSources: ["public.interactions", "public.rules"] as const,
  safetyProvenanceFields: [
    "source_label",
    "source_url",
    "source_type",
    "source_date",
    "last_reviewed_on",
    "exact_ingredient_form",
    "interaction_mechanism",
    "severity_rationale",
    "confidence",
    "user_qualification",
    "rule_version",
    "provenance_status",
  ] as const,
  policy: "Evidence metadata is maintained here. Citations resolve through the curated index. Runtime safety decisions remain deterministic and come only from the provenance-bearing Supabase safety tables.",
} as const;

const dose = (guidance: SupplementDoseGuidance) => guidance;

export const EVIDENCE_MASTER_LIBRARY: readonly EvidenceMasterEntry[] = [
  {
    id: "evidence_magnesium_glycinate",
    name: "Magnesium Glycinate",
    aliases: /\bmagnesium(?:\s+(?:bis)?glycinate)?\b/i,
    citationLookup: "magnesium (glycinate)",
    topics: ["sleep", "stress", "recovery"],
    evidenceStrength: "Mixed",
    bestFit: "General sleep support when magnesium intake may be low; evidence for insomnia itself is mixed.",
    evidenceSummary: "The curated record supports cautious use and highlights dose, bowel, drowsiness, kidney, and medication-spacing considerations.",
    lastReviewed: "2026-08-15",
    reviewCadenceDays: 365,
    safetyTopics: ["thyroid_medication_spacing", "kidney_context", "supplemental_upper_limit"],
    safetySummary: "Form, elemental amount, kidney context, and medication spacing can materially change the interpretation.",
    doseGuidance: dose({ name: "Magnesium Glycinate", startingDose: "100-200 mg elemental magnesium daily", typicalRange: "100-350 mg supplemental elemental magnesium daily", timing: "Evening", food: "With or without food", adjustment: "Begin at the low end and increase only if well tolerated", guardrail: "The adult upper limit for supplemental magnesium is 350 mg/day unless a clinician recommends otherwise", caution: "Separate from thyroid medication and certain antibiotics by at least 2-4 hours", evidenceLabel: "NIH ODS Magnesium", lastReviewed: "2026-08-15" }),
  },
  {
    id: "evidence_glycine",
    name: "Glycine",
    aliases: /\bglycine\b/i,
    citationLookup: "glycine",
    topics: ["sleep", "recovery"],
    evidenceStrength: "Emerging",
    bestFit: "Sleep quality and next-day tiredness when a simple bedtime experiment is appropriate.",
    evidenceSummary: "Small sleep studies are promising, but the evidence base is not yet large or definitive.",
    lastReviewed: "2026-08-15",
    reviewCadenceDays: 365,
    safetyTopics: ["sedating_additive"],
    safetySummary: "Timing and additive drowsiness matter when sedating medicines are present.",
    doseGuidance: dose({ name: "Glycine", startingDose: "3 g daily", typicalRange: "3 g daily", timing: "30-60 minutes before bed", food: "With or without food", caution: "Use extra caution alongside sedating medicines", evidenceLabel: "PubMed Glycine Sleep", lastReviewed: "2026-08-15" }),
  },
  {
    id: "evidence_melatonin",
    name: "Melatonin",
    aliases: /\bmelatonin\b/i,
    citationLookup: "melatonin",
    topics: ["sleep"],
    evidenceStrength: "Moderate",
    bestFit: "Circadian timing problems, jet lag, or a shifted sleep schedule rather than general sedation.",
    evidenceSummary: "Evidence is strongest for sleep timing and sleep-onset contexts; morning grogginess and medication context still matter.",
    lastReviewed: "2026-08-15",
    reviewCadenceDays: 365,
    safetyTopics: ["sedating_additive", "timing_context"],
    safetySummary: "Dose, timing, next-day grogginess, and concurrent sedating medicines require context.",
  },
  {
    id: "evidence_l_theanine",
    name: "L-Theanine",
    aliases: /\bl[- ]?theanine\b/i,
    citationLookup: "l-theanine",
    topics: ["sleep", "stress", "focus"],
    evidenceStrength: "Emerging",
    bestFit: "Stress-related difficulty winding down, with less direct evidence than timing-focused melatonin.",
    evidenceSummary: "Early controlled evidence suggests possible sleep and stress benefits, but it remains less established than first-line sleep habits.",
    lastReviewed: "2026-08-15",
    reviewCadenceDays: 365,
    safetyTopics: ["sedating_additive"],
    safetySummary: "Concurrent sedating medicines and next-day drowsiness deserve review.",
    doseGuidance: dose({ name: "L-Theanine", startingDose: "100 mg", typicalRange: "100-200 mg once or twice daily", timing: "Daytime for calm or 30-60 minutes before bed", food: "With or without food", adjustment: "Increase to 200 mg only if well tolerated", caution: "Use extra caution with sedating medicines", evidenceLabel: "PubMed L-Theanine", lastReviewed: "2026-08-15" }),
  },
  {
    id: "evidence_creatine_monohydrate",
    name: "Creatine Monohydrate",
    aliases: /\bcreatine(?:\s+monohydrate)?\b/i,
    citationLookup: "creatine monohydrate",
    topics: ["energy", "exercise", "recovery", "focus", "cognition"],
    evidenceStrength: "Strong",
    bestFit: "Strength, training capacity, and recovery; possible cognitive value in selected contexts rather than a stimulant-like energy boost.",
    evidenceSummary: "The curated library includes controlled and review-level evidence, with kidney context and total dose as important guardrails.",
    lastReviewed: "2026-08-15",
    reviewCadenceDays: 365,
    safetyTopics: ["kidney_context", "total_dose"],
    safetySummary: "Known kidney disease and total daily dose should be reviewed before a new experiment.",
    doseGuidance: dose({ name: "Creatine Monohydrate", startingDose: "3 g daily", typicalRange: "3-5 g daily", timing: "Any consistent time", food: "With water or a meal", adjustment: "A loading phase is not required", caution: "Review first with known kidney disease", evidenceLabel: "ISSN Creatine Position Stand", lastReviewed: "2026-08-15" }),
  },
  {
    id: "evidence_coq10",
    name: "CoQ10",
    aliases: /\b(?:coq10|coenzyme q10|ubiquinol|ubiquinone)\b/i,
    citationLookup: "coq10 (ubiquinone)",
    topics: ["energy", "heart", "recovery"],
    evidenceStrength: "Mixed",
    bestFit: "Context-specific fatigue or statin-related discussions rather than a universal energy supplement.",
    evidenceSummary: "Benefits vary substantially by population and reason for use, so it should not be presented as a general energy fix.",
    lastReviewed: "2026-08-15",
    reviewCadenceDays: 365,
    safetyTopics: ["anticoagulant_context", "blood_pressure_context"],
    safetySummary: "Anticoagulant and blood-pressure medication context can affect suitability.",
    doseGuidance: dose({ name: "CoQ10", startingDose: "100 mg daily", typicalRange: "100-200 mg daily", timing: "Morning or midday", food: "Take with a fat-containing meal", caution: "Review if using warfarin or blood-pressure medication", evidenceLabel: "PubMed CoQ10", lastReviewed: "2026-08-15" }),
  },
  {
    id: "evidence_vitamin_b12",
    name: "Vitamin B12",
    aliases: /\b(?:vitamin\s+)?b[- ]?12\b/i,
    citationLookup: "b12 (methylcobalamin)",
    topics: [],
    evidenceStrength: "Strong",
    bestFit: "Correcting low B12 intake or deficiency, not boosting energy when B12 status is already adequate.",
    evidenceSummary: "Evidence is strong for correcting deficiency but insufficient for a general energy benefit without deficiency risk or testing.",
    lastReviewed: "2026-08-15",
    reviewCadenceDays: 365,
    safetyTopics: ["deficiency_context", "duplicate_b_vitamins"],
    safetySummary: "Deficiency risk, laboratory context, and duplicate B-vitamin products determine relevance.",
  },
  {
    id: "evidence_omega_3",
    name: "Omega-3",
    aliases: /\b(?:omega[- ]?3|fish oil|epa|dha)\b/i,
    citationLookup: "omega-3 (epa+dha)",
    topics: ["heart", "cognition", "recovery"],
    evidenceStrength: "Moderate",
    bestFit: "Dietary omega-3 gaps and selected cardiovascular goals, with benefits depending on dose and context.",
    evidenceSummary: "Evidence varies by outcome; anticoagulant use and procedures require extra review.",
    lastReviewed: "2026-08-15",
    reviewCadenceDays: 365,
    safetyTopics: ["anticoagulant_bleeding", "procedure_bleeding", "epa_dha_amount"],
    safetySummary: "Combined EPA+DHA amount, anticoagulants, and upcoming procedures matter.",
    doseGuidance: dose({ name: "Omega-3", startingDose: "1,000 mg combined EPA+DHA daily", typicalRange: "1,000-2,000 mg EPA+DHA daily", timing: "With a meal, morning or evening", food: "Take with food", guardrail: "Do not exceed label directions; higher amounts require clinician review", caution: "Review first if using anticoagulants or before a procedure", evidenceLabel: "NIH ODS Omega-3", lastReviewed: "2026-08-15" }),
  },
  {
    id: "evidence_ashwagandha",
    name: "Ashwagandha",
    aliases: /\bashwagandha\b/i,
    citationLookup: "ashwagandha (ksm-66 or similar)",
    topics: ["stress", "sleep"],
    evidenceStrength: "Moderate",
    bestFit: "Stress-related sleep difficulty when thyroid, liver, pregnancy, and medication cautions do not dominate.",
    evidenceSummary: "Some trials report stress or sleep benefits, while product variability and safety context limit broad recommendations.",
    lastReviewed: "2026-08-15",
    reviewCadenceDays: 365,
    safetyTopics: ["thyroid_context", "liver_context", "pregnancy_caution", "product_variability"],
    safetySummary: "Thyroid, liver, pregnancy, medication, and product-standardization context can outweigh potential benefit.",
  },
  {
    id: "evidence_vitamin_d",
    name: "Vitamin D",
    aliases: /\bvitamin\s+d(?:3)?\b/i,
    citationLookup: "vitamin d3",
    topics: [],
    lastReviewed: "2026-08-15",
    reviewCadenceDays: 365,
    safetyTopics: ["total_daily_amount", "lab_context", "upper_limit"],
    safetySummary: "Total intake from all sources and laboratory context matter; the upper limit is a review threshold, not an instruction to change clinician-directed care.",
    doseGuidance: dose({ name: "Vitamin D", startingDose: "1,000 IU daily", typicalRange: "1,000-2,000 IU daily", timing: "Morning or midday", food: "Take with a fat-containing meal", guardrail: "Do not exceed 4,000 IU/day from all sources without clinician guidance and lab monitoring", caution: "Lab-guided dosing is preferred", evidenceLabel: "NIH ODS Vitamin D", lastReviewed: "2026-08-15" }),
  },
  {
    id: "evidence_psyllium",
    name: "Soluble fiber (psyllium)",
    aliases: /\b(?:psyllium|soluble fiber)\b/i,
    citationLookup: "fiber (psyllium husk)",
    topics: [],
    lastReviewed: "2026-08-15",
    reviewCadenceDays: 365,
    safetyTopics: ["medication_spacing", "hydration"],
    safetySummary: "Adequate water and spacing from medicines and supplements are core guardrails.",
    doseGuidance: dose({ name: "Soluble fiber (psyllium)", startingDose: "3-5 g once daily", typicalRange: "5-10 g daily in divided servings", timing: "Before or with a meal", food: "Take with at least 8 oz of water", adjustment: "Increase gradually over 1-2 weeks", caution: "Separate from medicines and supplements by at least 2 hours", evidenceLabel: "PubMed 30239559", lastReviewed: "2026-08-15" }),
  },
  {
    id: "evidence_curcumin",
    name: "Curcumin",
    aliases: /\b(?:curcumin|turmeric)\b/i,
    citationLookup: "curcumin (95% curcuminoids + piperine)",
    topics: [],
    lastReviewed: "2026-08-15",
    reviewCadenceDays: 365,
    safetyTopics: ["anticoagulant_bleeding", "procedure_bleeding", "gallbladder_context"],
    safetySummary: "Anticoagulants, procedures, gallbladder context, and formulation affect suitability.",
    doseGuidance: dose({ name: "Curcumin", startingDose: "500 mg daily", typicalRange: "500-1,000 mg daily", timing: "With a meal", food: "Take with food; use a standardized product", caution: "Review first with anticoagulants, gallbladder concerns, or before procedures", evidenceLabel: "PubMed Curcumin Review", lastReviewed: "2026-08-15" }),
  },
  {
    id: "evidence_probiotic",
    name: "Probiotic",
    aliases: /\bprobiotics?\b/i,
    citationLookup: "probiotic (lacto/bifido blend)",
    topics: [],
    lastReviewed: "2026-08-15",
    reviewCadenceDays: 365,
    safetyTopics: ["immune_context", "antibiotic_context", "strain_specificity"],
    safetySummary: "Strain, product, immune context, and concurrent antibiotics can change the interpretation.",
    doseGuidance: dose({ name: "Probiotic", startingDose: "one label-directed serving daily", typicalRange: "Follow the strain-specific product label; CFU counts are not interchangeable across products", timing: "At the same time daily", food: "Follow the product label", adjustment: "Start with the lowest label serving", caution: "Avoid without clinician review if significantly immunocompromised", evidenceLabel: "NIH ODS Probiotics", lastReviewed: "2026-08-15" }),
  },
  {
    id: "evidence_collagen_peptides",
    name: "Collagen peptides",
    aliases: /\bcollagen(?:\s+peptides?)?\b/i,
    citationLookup: "collagen peptides",
    topics: [],
    lastReviewed: "2026-08-15",
    reviewCadenceDays: 365,
    safetyTopics: ["product_source", "allergy_context"],
    safetySummary: "Product source and allergy context should be checked.",
    doseGuidance: dose({ name: "Collagen peptides", startingDose: "5 g daily", typicalRange: "5-10 g daily", timing: "Any consistent time", food: "Mix with food or a beverage", adjustment: "Increase toward 10 g if well tolerated", evidenceLabel: "PubMed Collagen Peptides", lastReviewed: "2026-08-15" }),
  },
];

function normalized(value: string) {
  return value.toLowerCase().replace(/[®™]/g, "").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

export function findEvidenceMasterEntry(value: string): EvidenceMasterEntry | null {
  const target = normalized(value);
  return EVIDENCE_MASTER_LIBRARY.find((entry) => normalized(entry.name) === target || entry.aliases.test(value)) ?? null;
}

export function evidenceReviewStatus(entry: EvidenceMasterEntry, asOf = new Date()): "current" | "review_due" | "invalid" {
  const reviewedAt = Date.parse(`${entry.lastReviewed}T00:00:00Z`);
  if (!Number.isFinite(reviewedAt)) return "invalid";
  const dueAt = reviewedAt + entry.reviewCadenceDays * 86_400_000;
  return asOf.getTime() <= dueAt ? "current" : "review_due";
}

export function auditEvidenceMasterLibrary(asOf = new Date()) {
  const issues: string[] = [];
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const entry of EVIDENCE_MASTER_LIBRARY) {
    if (ids.has(entry.id)) issues.push(`Duplicate evidence id: ${entry.id}`);
    if (names.has(normalized(entry.name))) issues.push(`Duplicate evidence name: ${entry.name}`);
    ids.add(entry.id);
    names.add(normalized(entry.name));
    if (!entry.citationLookup.trim()) issues.push(`Missing citation lookup: ${entry.id}`);
    if (!entry.safetyTopics.length || !entry.safetySummary.trim()) issues.push(`Missing safety metadata: ${entry.id}`);
    if (evidenceReviewStatus(entry, asOf) === "invalid") issues.push(`Invalid review date: ${entry.id}`);
    if (entry.evidenceStrength && (!entry.bestFit?.trim() || !entry.evidenceSummary?.trim())) issues.push(`Incomplete coaching metadata: ${entry.id}`);
    if (entry.doseGuidance && entry.doseGuidance.lastReviewed !== entry.lastReviewed) issues.push(`Mismatched review date: ${entry.id}`);
  }
  return { version: EVIDENCE_LIBRARY_MANIFEST.version, entryCount: EVIDENCE_MASTER_LIBRARY.length, issues };
}
