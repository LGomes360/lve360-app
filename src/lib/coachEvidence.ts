import { getEvidenceEntriesFor } from "@/lib/evidence";
import { getSupplementDoseGuidance } from "@/lib/supplementDosingRegistry";

export type CoachEvidenceStrength = "Strong" | "Moderate" | "Emerging" | "Limited" | "Mixed" | "Insufficient";

export type CoachEvidenceOption = {
  id: string;
  name: string;
  bestFit: string;
  evidenceStrength: CoachEvidenceStrength;
  evidenceSummary: string;
  citationLabel: string;
  citationUrl: string;
  doseGuidance: ReturnType<typeof getSupplementDoseGuidance>;
};

type EvidenceSeed = Omit<CoachEvidenceOption, "id" | "citationLabel" | "citationUrl" | "doseGuidance"> & {
  aliases: RegExp;
  topics: string[];
};

// This is a retrieval index over LVE360's curated evidence, not a fixed recommendation list.
// Personal fit and final inclusion are decided later by the member context and safety engine.
const EVIDENCE_SEEDS: EvidenceSeed[] = [
  {
    name: "Magnesium Glycinate",
    aliases: /\bmagnesium(?:\s+(?:bis)?glycinate)?\b/i,
    topics: ["sleep", "stress", "recovery"],
    bestFit: "General sleep support when magnesium intake may be low; evidence for insomnia itself is mixed.",
    evidenceStrength: "Mixed",
    evidenceSummary: "The LVE360 evidence record supports cautious use and highlights dose, bowel, drowsiness, kidney, and medication-spacing considerations.",
  },
  {
    name: "Glycine",
    aliases: /\bglycine\b/i,
    topics: ["sleep", "recovery"],
    bestFit: "Sleep quality and next-day tiredness when a simple bedtime experiment is appropriate.",
    evidenceStrength: "Emerging",
    evidenceSummary: "Small sleep studies are promising, but the evidence base is not yet large or definitive.",
  },
  {
    name: "Melatonin",
    aliases: /\bmelatonin\b/i,
    topics: ["sleep"],
    bestFit: "Circadian timing problems, jet lag, or a shifted sleep schedule rather than general sedation.",
    evidenceStrength: "Moderate",
    evidenceSummary: "Evidence is strongest for sleep timing and sleep-onset contexts; morning grogginess and medication context still matter.",
  },
  {
    name: "L-Theanine",
    aliases: /\bl[- ]?theanine\b/i,
    topics: ["sleep", "stress", "focus"],
    bestFit: "Stress-related difficulty winding down, with less direct evidence than timing-focused melatonin.",
    evidenceStrength: "Emerging",
    evidenceSummary: "Early controlled evidence suggests possible sleep and stress benefits, but it remains less established than first-line sleep habits.",
  },
  {
    name: "Creatine Monohydrate",
    aliases: /\bcreatine(?:\s+monohydrate)?\b/i,
    topics: ["energy", "exercise", "recovery", "focus", "cognition"],
    bestFit: "Strength, training capacity, and recovery; possible cognitive value in selected contexts rather than a stimulant-like energy boost.",
    evidenceStrength: "Strong",
    evidenceSummary: "The LVE360 evidence library includes controlled and review-level evidence, with kidney context and total dose as important guardrails.",
  },
  {
    name: "CoQ10",
    aliases: /\b(?:coq10|coenzyme q10|ubiquinol|ubiquinone)\b/i,
    topics: ["energy", "heart", "recovery"],
    bestFit: "Context-specific fatigue or statin-related discussions rather than a universal energy supplement.",
    evidenceStrength: "Mixed",
    evidenceSummary: "Benefits vary substantially by population and reason for use, so it should not be presented as a general energy fix.",
  },
  {
    name: "Vitamin B12",
    aliases: /\b(?:vitamin\s+)?b[- ]?12\b/i,
    topics: [],
    bestFit: "Correcting low B12 intake or deficiency, not boosting energy when B12 status is already adequate.",
    evidenceStrength: "Strong",
    evidenceSummary: "The evidence is strong for correcting deficiency but insufficient for a general energy benefit without deficiency risk or testing.",
  },
  {
    name: "Omega-3",
    aliases: /\b(?:omega[- ]?3|fish oil|epa|dha)\b/i,
    topics: ["heart", "cognition", "recovery"],
    bestFit: "Dietary omega-3 gaps and selected cardiovascular goals, with benefits depending on dose and context.",
    evidenceStrength: "Moderate",
    evidenceSummary: "Evidence varies by outcome; anticoagulant use and procedures require extra review.",
  },
  {
    name: "Ashwagandha",
    aliases: /\bashwagandha\b/i,
    topics: ["stress", "sleep"],
    bestFit: "Stress-related sleep difficulty when thyroid, liver, pregnancy, and medication cautions do not dominate.",
    evidenceStrength: "Moderate",
    evidenceSummary: "Some trials report stress or sleep benefits, while product variability and safety context limit broad recommendations.",
  },
];

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

export function coachQuestionTopics(question: string): string[] {
  const value = question.toLowerCase();
  return [
    /\b(?:sleep|insomnia|bedtime|fall asleep|stay asleep|wake up)\b/.test(value) ? "sleep" : null,
    /\b(?:energy|fatigue|tired|vitality)\b/.test(value) ? "energy" : null,
    /\b(?:exercise|workout|training|strength|muscle)\b/.test(value) ? "exercise" : null,
    /\b(?:recovery|sore|rebuild)\b/.test(value) ? "recovery" : null,
    /\b(?:focus|attention|concentration)\b/.test(value) ? "focus" : null,
    /\b(?:cognition|cognitive|memory|brain)\b/.test(value) ? "cognition" : null,
    /\b(?:stress|anxiety|calm|wind down)\b/.test(value) ? "stress" : null,
    /\b(?:heart|cardiovascular|cholesterol|triglyceride)\b/.test(value) ? "heart" : null,
  ].filter((topic): topic is string => Boolean(topic));
}

export function retrieveCoachEvidence(question: string, limit = 4): CoachEvidenceOption[] {
  const topics = coachQuestionTopics(question);
  const explicit = EVIDENCE_SEEDS.filter((seed) => seed.aliases.test(question));
  const topical = topics.length
    ? EVIDENCE_SEEDS.filter((seed) => seed.topics.some((topic) => topics.includes(topic)))
    : [];
  const seeds = [...explicit, ...topical].filter((seed, index, values) =>
    values.findIndex((candidate) => candidate.name === seed.name) === index
  ).slice(0, limit);

  return seeds.flatMap((seed) => {
    const evidence = getEvidenceEntriesFor(seed.name, 1)[0];
    if (!evidence) return [];
    return [{
      id: `evidence_${slug(seed.name)}`,
      name: seed.name,
      bestFit: seed.bestFit,
      evidenceStrength: seed.evidenceStrength,
      evidenceSummary: seed.evidenceSummary,
      citationLabel: [evidence.journal, evidence.year].filter(Boolean).join(" · ") || "LVE360 curated evidence",
      citationUrl: evidence.url,
      doseGuidance: getSupplementDoseGuidance(seed.name),
    }];
  });
}

export function evidenceOptionByName(options: CoachEvidenceOption[], name: string) {
  const normalized = name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return options.find((option) => {
    const candidate = option.name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    return normalized === candidate || normalized.includes(candidate) || candidate.includes(normalized);
  }) ?? null;
}
