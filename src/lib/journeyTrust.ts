const TRUSTWORTHY_SYNTHESIS_VERSION = 7;

export function isTrustworthyJourneySynthesisVersion(value: string | null | undefined): boolean {
  const match = /^weekly-review-synthesis-v(\d+)$/.exec(value?.trim() ?? "");
  return !!match && Number(match[1]) >= TRUSTWORTHY_SYNTHESIS_VERSION;
}
