const normalize = (value: unknown) => String(value ?? "")
  .replace(/[\u2018\u2019]/g, "'")
  .replace(/\s+/g, " ")
  .trim()
  .toLowerCase();

const PREFERENCE_LABELS = [
  "what is realistic for your lifestyle",
  "when it comes to supplements, do you prefer",
  "which form of supplements do you prefer",
];

const PREFERENCE_VALUES = [
  "once per day",
  "twice per day",
  "three times per day",
  "most cost-effective options",
  "trusted name brands",
  "clean label",
  "doesn't matter",
  "doesn\u2019t matter",
  "just what works best",
  "capsules",
  "powders",
  "either (no preference)",
];

const ENDOCRINE_ACTIVE_SUPPLEMENT_RE = /^(?:dhea|pregnenolone)\b/i;
const NON_SHOPPABLE_MEDICATION_OR_HORMONE_RE = /\b(?:metformin|zepbound|tirzepatide|mounjaro|armour\s+thyroid|levothyroxine|synthroid|testosterone(?:\s+gel)?|dhea|pregnenolone|lunesta|eszopiclone|xanax|zanax|alprazolam)\b/i;
const MALFORMED_ITEM_NAME_RE = /^(?:each|\d+|0{2,}\s*(?:mg|mcg|g|iu|ml)\b.*|\d+(?:\.\d+)?\s*(?:mg|mcg|g|iu|ml|%)(?:\s+(?:daily|nightly|morning|evening|night|am|pm))?)$/i;

export const RECOMMENDABLE_SUPPLEMENT_CANDIDATES = [
  "Omega-3",
  "Vitamin D",
  "Magnesium Glycinate",
  "Creatine Monohydrate",
  "Glycine",
  "CoQ10",
  "Soluble fiber (psyllium)",
  "Probiotic",
  "Curcumin",
  "Collagen peptides",
  "L-Theanine",
  "Vitamin B12",
  "Berberine",
];

export function isPreferenceFieldOrValue(value: unknown): boolean {
  const text = normalize(value);
  return PREFERENCE_LABELS.some((label) => text.includes(label)) ||
    PREFERENCE_VALUES.some((preference) => text === normalize(preference));
}

export function preferenceValuesFound(text: string): string[] {
  const fragments = text
    .split(/\r?\n/)
    .flatMap((line) => line.split("|"))
    .map((fragment) => normalize(fragment.replace(/^[\s>*-]+|[\s*.:;-]+$/g, "")));
  return PREFERENCE_VALUES
    .map(normalize)
    .filter((value, index, values) => values.indexOf(value) === index && fragments.includes(value));
}

export function isMedicationOrHormoneName(value: unknown): boolean {
  const text = normalize(value);
  return Boolean(text && NON_SHOPPABLE_MEDICATION_OR_HORMONE_RE.test(text));
}

export function isEndocrineActiveSupplementName(value: unknown): boolean {
  return ENDOCRINE_ACTIVE_SUPPLEMENT_RE.test(String(value ?? "").trim());
}

export function isEligibleSupplementName(value: unknown): boolean {
  const text = normalize(value);
  return Boolean(
    text &&
    !isPreferenceFieldOrValue(text) &&
    !isMedicationOrHormoneName(text) &&
    !MALFORMED_ITEM_NAME_RE.test(text) &&
    !/(?:\u2014|\u2013|â€”|â€“|-)\s*$/.test(text) &&
    !/^\[object object\]$/.test(text) &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(text)
  );
}
