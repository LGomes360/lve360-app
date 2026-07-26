export type WeightUnit = "lb" | "kg";
export type ReminderPreference = "none" | "email";

export type AccountSettings = {
  email: string;
  tier: string;
  billing_interval: string | null;
  subscription_end_date: string | null;
  preferred_name: string;
  weight_unit: WeightUnit;
  reminder_preference: ReminderPreference;
  timezone: string;
  cue_hour: number;
  quiet_start_hour: number;
  quiet_end_hour: number;
};

export function normalizePreferredName(value: unknown): string | null | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized) return null;
  if (normalized.length > 80) return undefined;
  return normalized;
}

export function isWeightUnit(value: unknown): value is WeightUnit {
  return value === "lb" || value === "kg";
}

export function isReminderPreference(value: unknown): value is ReminderPreference {
  return value === "none" || value === "email";
}

export function isHour(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 23;
}

export function isIanaTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 80) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}
