export type CompletionKind = "full" | "minimum";

export type DailyPracticeCompletion = {
  completion_date: string;
  completion_kind: CompletionKind;
};

const LOCAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

export function parseLocalDate(value: unknown, now = new Date()): string | null {
  if (typeof value !== "string" || !LOCAL_DATE_PATTERN.test(value)) return null;
  const parsed = new Date(`${value}T12:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) return null;

  const serverDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const requestedDay = Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate());
  return Math.abs(requestedDay - serverDay) <= DAY_MS ? value : null;
}

export function isCompletionKind(value: unknown): value is CompletionKind {
  return value === "full" || value === "minimum";
}

export function weekBounds(localDate: string): { start: string; end: string; days: string[] } {
  const date = new Date(`${localDate}T12:00:00.000Z`);
  const mondayOffset = (date.getUTCDay() + 6) % 7;
  const startDate = new Date(date.getTime() - mondayOffset * DAY_MS);
  const days = Array.from({ length: 7 }, (_, index) => {
    return new Date(startDate.getTime() + index * DAY_MS).toISOString().slice(0, 10);
  });
  return { start: days[0], end: days[6], days };
}

export function completionCount(completions: DailyPracticeCompletion[]): number {
  return new Set(completions.map((completion) => completion.completion_date)).size;
}
