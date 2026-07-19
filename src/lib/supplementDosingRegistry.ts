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

const REGISTRY: Record<string, SupplementDoseGuidance> = {
  "omega-3": { name: "Omega-3", startingDose: "1,000 mg combined EPA+DHA daily", typicalRange: "1,000-2,000 mg EPA+DHA daily", timing: "With a meal, morning or evening", food: "Take with food", guardrail: "Do not exceed label directions; higher amounts require clinician review", caution: "Review first if using anticoagulants or before a procedure", evidenceLabel: "NIH ODS Omega-3", lastReviewed: "2026-07-18" },
  "vitamin d": { name: "Vitamin D", startingDose: "1,000 IU daily", typicalRange: "1,000-2,000 IU daily", timing: "Morning or midday", food: "Take with a fat-containing meal", guardrail: "Do not exceed 4,000 IU/day from all sources without clinician guidance and lab monitoring", caution: "Lab-guided dosing is preferred", evidenceLabel: "NIH ODS Vitamin D", lastReviewed: "2026-07-18" },
  "magnesium glycinate": { name: "Magnesium Glycinate", startingDose: "100-200 mg elemental magnesium daily", typicalRange: "100-350 mg supplemental elemental magnesium daily", timing: "Evening", food: "With or without food", adjustment: "Begin at the low end and increase only if well tolerated", guardrail: "The adult upper limit for supplemental magnesium is 350 mg/day unless a clinician recommends otherwise", caution: "Separate from thyroid medication and certain antibiotics by at least 2-4 hours", evidenceLabel: "NIH ODS Magnesium", lastReviewed: "2026-07-18" },
  "creatine monohydrate": { name: "Creatine Monohydrate", startingDose: "3 g daily", typicalRange: "3-5 g daily", timing: "Any consistent time", food: "With water or a meal", adjustment: "A loading phase is not required", caution: "Review first with known kidney disease", evidenceLabel: "ISSN Creatine Position Stand", lastReviewed: "2026-07-18" },
  glycine: { name: "Glycine", startingDose: "3 g daily", typicalRange: "3 g daily", timing: "30-60 minutes before bed", food: "With or without food", caution: "Use extra caution alongside sedating medicines", evidenceLabel: "PubMed Glycine Sleep", lastReviewed: "2026-07-18" },
  coq10: { name: "CoQ10", startingDose: "100 mg daily", typicalRange: "100-200 mg daily", timing: "Morning or midday", food: "Take with a fat-containing meal", caution: "Review if using warfarin or blood-pressure medication", evidenceLabel: "PubMed CoQ10", lastReviewed: "2026-07-18" },
  "soluble fiber (psyllium)": { name: "Soluble fiber (psyllium)", startingDose: "3-5 g once daily", typicalRange: "5-10 g daily in divided servings", timing: "Before or with a meal", food: "Take with at least 8 oz of water", adjustment: "Increase gradually over 1-2 weeks", caution: "Separate from medicines and supplements by at least 2 hours", evidenceLabel: "PubMed 30239559", lastReviewed: "2026-07-18" },
  psyllium: { name: "Soluble fiber (psyllium)", startingDose: "3-5 g once daily", typicalRange: "5-10 g daily in divided servings", timing: "Before or with a meal", food: "Take with at least 8 oz of water", adjustment: "Increase gradually over 1-2 weeks", caution: "Separate from medicines and supplements by at least 2 hours", evidenceLabel: "PubMed 30239559", lastReviewed: "2026-07-18" },
  curcumin: { name: "Curcumin", startingDose: "500 mg daily", typicalRange: "500-1,000 mg daily", timing: "With a meal", food: "Take with food; use a standardized product", caution: "Review first with anticoagulants, gallbladder concerns, or before procedures", evidenceLabel: "PubMed Curcumin Review", lastReviewed: "2026-07-18" },
  probiotic: { name: "Probiotic", startingDose: "one label-directed serving daily", typicalRange: "Follow the strain-specific product label; CFU counts are not interchangeable across products", timing: "At the same time daily", food: "Follow the product label", adjustment: "Start with the lowest label serving", caution: "Avoid without clinician review if significantly immunocompromised", evidenceLabel: "NIH ODS Probiotics", lastReviewed: "2026-07-18" },
  "collagen peptides": { name: "Collagen peptides", startingDose: "5 g daily", typicalRange: "5-10 g daily", timing: "Any consistent time", food: "Mix with food or a beverage", adjustment: "Increase toward 10 g if well tolerated", evidenceLabel: "PubMed Collagen Peptides", lastReviewed: "2026-07-18" },
  "l-theanine": { name: "L-Theanine", startingDose: "100 mg", typicalRange: "100-200 mg once or twice daily", timing: "Daytime for calm or 30-60 minutes before bed", food: "With or without food", adjustment: "Increase to 200 mg only if well tolerated", caution: "Use extra caution with sedating medicines", evidenceLabel: "PubMed L-Theanine", lastReviewed: "2026-07-18" },
};

function key(value: string): string {
  return value.toLowerCase().replace(/[®™]/g, "").replace(/\s+/g, " ").trim();
}

export function getSupplementDoseGuidance(name: string): SupplementDoseGuidance | null {
  const normalized = key(name)
    .replace(/^omega\s*3.*$/, "omega-3")
    .replace(/^magnesium(?:\s+bis)?glycinate.*$/, "magnesium glycinate")
    .replace(/^creatine.*$/, "creatine monohydrate")
    .replace(/^coenzyme q10.*$/, "coq10")
    .replace(/^psyllium.*$/, "psyllium")
    .replace(/^collagen.*$/, "collagen peptides");
  return REGISTRY[normalized] ?? null;
}

export function formatStartingGuidance(name: string): string | null {
  const entry = getSupplementDoseGuidance(name);
  if (!entry) return null;
  return [
    `An evidence-informed starting point is ${entry.startingDose}.`,
    `Typical range: ${entry.typicalRange}.`,
    `Timing: ${entry.timing}; ${entry.food.toLowerCase()}.`,
    entry.adjustment ? `Adjustment: ${entry.adjustment}.` : null,
    entry.guardrail ? `Guardrail: ${entry.guardrail}.` : null,
    entry.caution ? `Safety note: ${entry.caution}.` : null,
  ].filter(Boolean).join(" ");
}
