export async function applySafetyChecks(markdown: string, submission: any) {
  // TODO: cross-check AI output with ULs, meds, conditions
  // For now, just return unmodified markdown
  return markdown;
}
