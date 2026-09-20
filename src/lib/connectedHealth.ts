export const APPLE_HEALTH_DATA_TYPES = [
  "steps",
  "sleep",
  "resting_heart_rate",
  "weight",
  "active_energy",
  "exercise_time",
] as const;

export type AppleHealthDataType = (typeof APPLE_HEALTH_DATA_TYPES)[number];

export type ConnectedHealthDailyMetric = {
  local_date: string;
  time_zone: string;
  steps: number | null;
  sleep_minutes: number | null;
  resting_heart_rate: number | null;
  weight_kg: number | null;
  active_energy_kcal: number | null;
  exercise_minutes: number | null;
  source_updated_at: string | null;
};

export type AppleHealthSyncPayload = {
  requested_data_types: AppleHealthDataType[];
  days: ConnectedHealthDailyMetric[];
  removed_local_dates: string[];
};

export type ConnectedHealthSummary = {
  provider: "apple_health";
  status: "connected" | "paused" | "disconnected" | "error";
  requestedDataTypes: AppleHealthDataType[];
  lastSyncCompletedAt: string | null;
  latest: ConnectedHealthDailyMetric | null;
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS_PER_SYNC = 31;
const DAY_MS = 86_400_000;
const DATA_TYPES = new Set<string>(APPLE_HEALTH_DATA_TYPES);

export function validateAppleHealthSyncPayload(
  value: unknown,
  now = new Date(),
): AppleHealthSyncPayload | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  if (!Array.isArray(input.requested_data_types) || !Array.isArray(input.days)) return null;
  if (input.days.length > MAX_DAYS_PER_SYNC) return null;
  if (input.removed_local_dates != null && !Array.isArray(input.removed_local_dates)) return null;

  const requested = [...new Set(input.requested_data_types)]
    .filter((item): item is AppleHealthDataType => typeof item === "string" && DATA_TYPES.has(item));
  if (requested.length !== input.requested_data_types.length) return null;

  const dates = new Set<string>();
  const days: ConnectedHealthDailyMetric[] = [];
  for (const candidate of input.days) {
    const parsed = parseDay(candidate, now);
    if (!parsed || dates.has(parsed.local_date)) return null;
    if (!dayUsesOnlyRequestedTypes(parsed, new Set(requested))) return null;
    dates.add(parsed.local_date);
    days.push(parsed);
  }

  const removed = input.removed_local_dates ?? [];
  if (removed.length > MAX_DAYS_PER_SYNC) return null;
  const removedDates = new Set<string>();
  for (const candidate of removed) {
    if (typeof candidate !== "string" || !isAllowedLocalDate(candidate, now)) return null;
    if (dates.has(candidate) || removedDates.has(candidate)) return null;
    removedDates.add(candidate);
  }

  return { requested_data_types: requested, days, removed_local_dates: [...removedDates] };
}

function isAllowedLocalDate(value: string, now: Date): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) return false;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const day = Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate());
  return day >= today - 90 * DAY_MS && day <= today + DAY_MS;
}

function dayUsesOnlyRequestedTypes(
  day: ConnectedHealthDailyMetric,
  requested: Set<AppleHealthDataType>,
): boolean {
  return (day.steps == null || requested.has("steps"))
    && (day.sleep_minutes == null || requested.has("sleep"))
    && (day.resting_heart_rate == null || requested.has("resting_heart_rate"))
    && (day.weight_kg == null || requested.has("weight"))
    && (day.active_energy_kcal == null || requested.has("active_energy"))
    && (day.exercise_minutes == null || requested.has("exercise_time"));
}

function parseDay(value: unknown, now: Date): ConnectedHealthDailyMetric | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  if (typeof input.local_date !== "string" || !isAllowedLocalDate(input.local_date, now)) return null;
  if (typeof input.time_zone !== "string" || !isTimeZone(input.time_zone)) return null;

  const steps = nullableNumber(input.steps, 0, 500000, true);
  const sleepMinutes = nullableNumber(input.sleep_minutes, 0, 1440, true);
  const restingHeartRate = nullableNumber(input.resting_heart_rate, 20, 250);
  const weightKg = nullableNumber(input.weight_kg, 20, 500);
  const activeEnergyKcal = nullableNumber(input.active_energy_kcal, 0, 50000);
  const exerciseMinutes = nullableNumber(input.exercise_minutes, 0, 1440, true);
  if ([steps, sleepMinutes, restingHeartRate, weightKg, activeEnergyKcal, exerciseMinutes].includes(undefined)) return null;
  if ([steps, sleepMinutes, restingHeartRate, weightKg, activeEnergyKcal, exerciseMinutes].every((item) => item === null)) return null;

  const sourceUpdatedAt = input.source_updated_at == null
    ? null
    : parseTimestamp(input.source_updated_at, now);
  if (input.source_updated_at != null && sourceUpdatedAt == null) return null;

  return {
    local_date: input.local_date,
    time_zone: input.time_zone,
    steps: steps as number | null,
    sleep_minutes: sleepMinutes as number | null,
    resting_heart_rate: restingHeartRate as number | null,
    weight_kg: weightKg as number | null,
    active_energy_kcal: activeEnergyKcal as number | null,
    exercise_minutes: exerciseMinutes as number | null,
    source_updated_at: sourceUpdatedAt,
  };
}

function nullableNumber(
  value: unknown,
  minimum: number,
  maximum: number,
  integer = false,
): number | null | undefined {
  if (value == null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  if (integer && !Number.isInteger(value)) return undefined;
  if (value < minimum || value > maximum) return undefined;
  return value;
}

function parseTimestamp(value: unknown, now: Date): string | null {
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.getTime() > now.getTime() + DAY_MS) return null;
  return parsed.toISOString();
}

function isTimeZone(value: string): boolean {
  if (value.length > 100) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}
