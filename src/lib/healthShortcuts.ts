import { APPLE_HEALTH_DATA_TYPES, type AppleHealthDataType } from "./connectedHealth.ts";

export const HEALTH_SHORTCUT_TYPES = APPLE_HEALTH_DATA_TYPES;
export type HealthShortcutType = AppleHealthDataType;

export type HealthShortcutMeasurement = {
  localDate: string;
  timeZone: string;
  type: HealthShortcutType;
  column: "steps" | "sleep_minutes" | "resting_heart_rate" | "weight_kg" | "active_energy_kcal" | "exercise_minutes";
  value: number;
};

const SPECS = {
  steps: { column: "steps", units: ["count"], minimum: 0, maximum: 500000, integer: true },
  sleep: { column: "sleep_minutes", units: ["min"], minimum: 0, maximum: 1440, integer: true },
  resting_heart_rate: { column: "resting_heart_rate", units: ["bpm"], minimum: 20, maximum: 250, integer: false },
  weight: { column: "weight_kg", units: ["kg", "lb"], minimum: 20, maximum: 500, integer: false },
  active_energy: { column: "active_energy_kcal", units: ["kcal"], minimum: 0, maximum: 50000, integer: false },
  exercise_time: { column: "exercise_minutes", units: ["min"], minimum: 0, maximum: 1440, integer: true },
} as const;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_AGE_DAYS = 30;
const DAY_MS = 86_400_000;

export function parseHealthShortcutTypes(value: unknown): HealthShortcutType[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > HEALTH_SHORTCUT_TYPES.length) return null;
  const known = new Set<string>(HEALTH_SHORTCUT_TYPES);
  if (value.some((item) => typeof item !== "string" || !known.has(item))) return null;
  const unique = [...new Set(value)] as HealthShortcutType[];
  return unique.length === value.length ? unique : null;
}

export function parseHealthShortcutMeasurement(
  value: unknown,
  allowedTypes: readonly HealthShortcutType[],
  timeZone: string,
  now = new Date(),
): HealthShortcutMeasurement | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (typeof input.type !== "string" || !allowedTypes.includes(input.type as HealthShortcutType)) return null;
  const type = input.type as HealthShortcutType;
  const spec = SPECS[type];
  if (typeof input.unit !== "string" || !(spec.units as readonly string[]).includes(input.unit)) return null;

  const raw = parseNumber(input.value);
  if (raw == null) return null;
  const converted = type === "weight" && input.unit === "lb" ? raw * 0.45359237 : raw;
  if (converted < spec.minimum || converted > spec.maximum || (spec.integer && !Number.isInteger(converted))) return null;

  const today = localDateInTimeZone(now, timeZone);
  if (!today) return null;
  const localDate = input.local_date == null ? today : input.local_date;
  if (typeof localDate !== "string" || !DATE_PATTERN.test(localDate)) return null;
  const parsedDate = new Date(`${localDate}T12:00:00.000Z`);
  if (Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== localDate) return null;
  const daysOld = (Date.parse(`${today}T00:00:00.000Z`) - Date.parse(`${localDate}T00:00:00.000Z`)) / DAY_MS;
  if (daysOld < 0 || daysOld > MAX_AGE_DAYS) return null;

  return {
    localDate,
    timeZone,
    type,
    column: spec.column,
    value: spec.integer ? converted : Math.round(converted * (type === "weight" ? 1000 : 100)) / (type === "weight" ? 1000 : 100),
  };
}

export function localDateInTimeZone(date: Date, timeZone: string): string | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(date);
    const get = (type: string) => parts.find((part) => part.type === type)?.value;
    const year = get("year");
    const month = get("month");
    const day = get("day");
    return year && month && day ? `${year}-${month}-${day}` : null;
  } catch {
    return null;
  }
}

function parseNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !/^\d{1,6}(?:\.\d{1,4})?$/.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
