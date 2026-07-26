export type NormalizedHeight = {
  display: string;
  feet: number;
  inches: number;
  totalInches: number;
  centimeters: number;
};

export function normalizeHeight(value: unknown): NormalizedHeight | undefined {
  if (value == null) return undefined;
  const raw = String(value).trim().toLowerCase();
  if (!raw) return undefined;

  const normalized = raw
    .replace(/[’′]/g, "'")
    .replace(/[“”″]/g, '"')
    .replace(/\s+/g, " ");

  let totalInches: number | undefined;
  const feetAndInches = normalized.match(
    /^(\d{1,2})(?:\s*(?:ft|feet|foot|'))(?:\s*[-,]?\s*)(\d{1,2})(?:\s*(?:in|inch|inches|"))?$/
  );
  const dashed = normalized.match(/^(\d{1,2})\s*-\s*(\d{1,2})$/);
  const inchesOnly = normalized.match(/^(\d{2,3}(?:\.\d+)?)\s*(?:in|inch|inches|")$/);
  const centimeters = normalized.match(/^(\d{2,3}(?:\.\d+)?)\s*(?:cm|centimeter|centimeters)$/);

  if (feetAndInches || dashed) {
    const match = feetAndInches ?? dashed;
    const feet = Number(match?.[1]);
    const inches = Number(match?.[2]);
    if (feet >= 3 && feet <= 8 && inches >= 0 && inches < 12) {
      totalInches = feet * 12 + inches;
    }
  } else if (inchesOnly) {
    totalInches = Number(inchesOnly[1]);
  } else if (centimeters) {
    totalInches = Number(centimeters[1]) / 2.54;
  }

  if (!totalInches || totalInches < 36 || totalInches > 100) return undefined;

  const roundedInches = Math.round(totalInches);
  const feet = Math.floor(roundedInches / 12);
  const inches = roundedInches % 12;
  return {
    display: `${feet}' ${inches}"`,
    feet,
    inches,
    totalInches: roundedInches,
    centimeters: Number((roundedInches * 2.54).toFixed(1)),
  };
}

export function normalizeWeightPounds(value: unknown): number | undefined {
  if (value == null) return undefined;
  const raw = String(value).trim().toLowerCase();
  if (!raw) return undefined;

  const number = Number(raw.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(number) || number <= 0) return undefined;

  const pounds = /\bkg\b|kilogram/.test(raw) ? number * 2.20462 : number;
  if (pounds < 50 || pounds > 1_500) return undefined;
  return Number(pounds.toFixed(1));
}
