export type DoseIntegrityIssue = {
  code: "possible_unit_mismatch";
  message: string;
};

const VITAMIN_D_NAME_RE = /\b(?:vitamin\s*d(?:3)?|cholecalciferol)\b/i;
const MILLIGRAM_OR_GRAM_RE = /(?:^|\s)\d+(?:\.\d+)?\s*(?:mg|milligrams?|g|grams?)\b/i;

export function doseIntegrityIssue(name: string, dose: string | null | undefined): DoseIntegrityIssue | null {
  const recordedDose = dose?.trim();
  if (!recordedDose) return null;
  if (VITAMIN_D_NAME_RE.test(name) && MILLIGRAM_OR_GRAM_RE.test(recordedDose)) {
    return {
      code: "possible_unit_mismatch",
      message: "Check this amount and unit against the product label. Vitamin D labels commonly use IU or mcg, so an entry in mg or g may be a recording error.",
    };
  }
  return null;
}
