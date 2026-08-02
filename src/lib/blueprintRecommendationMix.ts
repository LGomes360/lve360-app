export const BLUEPRINT_MIN_RECOMMENDATIONS = 8;
export const BLUEPRINT_TARGET_RECOMMENDATIONS = 10;

const ALLOWED_STATUSES = new Set([
  "Current - optimize",
  "New - consider",
  "Clinician review",
]);

export function validateBlueprintRecommendationMix(statuses: string[]) {
  const counts = {
    total: statuses.length,
    current: statuses.filter((status) => status === "Current - optimize").length,
    new: statuses.filter((status) => status === "New - consider").length,
    clinicianReview: statuses.filter((status) => status === "Clinician review").length,
  };
  return {
    valid: counts.total >= BLUEPRINT_MIN_RECOMMENDATIONS &&
      counts.total <= BLUEPRINT_TARGET_RECOMMENDATIONS &&
      counts.current <= 5 &&
      (counts.new + counts.clinicianReview) >= 3 &&
      statuses.every((status) => ALLOWED_STATUSES.has(status)),
    counts,
  };
}
