export const MEMBER_REPORTED_CONTEXT_LIMIT = 280;

export function normalizeMemberReportedContext(
  value: unknown,
  limit = MEMBER_REPORTED_CONTEXT_LIMIT,
): string | null {
  if (typeof value !== "string") return null;
  const normalized = value
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, Math.max(1, limit));
  return normalized || null;
}

