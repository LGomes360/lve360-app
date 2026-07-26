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
