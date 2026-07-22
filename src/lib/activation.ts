import { isSafetySensitiveBlueprintAction } from "./blueprintActions";

export const IDENTITY_OPTIONS = [
  { value: "movement", label: "Someone who moves consistently" },
  { value: "nutrition", label: "Someone who eats with intention" },
  { value: "sleep", label: "Someone who protects their sleep" },
  { value: "emotional_health", label: "Someone who responds calmly" },
  { value: "relationships", label: "Someone who invests in relationships" },
  { value: "focus", label: "Someone who protects their attention" },
  { value: "career", label: "Someone who does meaningful work well" },
  { value: "happiness", label: "Someone who makes room for joy" },
  { value: "overall_health", label: "Someone who keeps promises to their health" },
] as const;

export type IdentityDirection = (typeof IDENTITY_OPTIONS)[number]["value"];
export type ReminderPreference = "none" | "email";
export type ExperimentStatus = "draft" | "active" | "completed" | "archived";

export type WeeklyExperiment = {
  id: string;
  user_id: string;
  source_stack_id: string | null;
  source_action_id: string | null;
  identity_direction: IdentityDirection | null;
  action_label: string | null;
  cue: string | null;
  frequency_per_week: number | null;
  minimum_version: string | null;
  reminder_preference: ReminderPreference;
  onboarding_step: number;
  status: ExperimentStatus;
  week_start: string;
  activated_at: string | null;
  created_at: string;
  updated_at: string;
};

export const STARTER_ACTIONS: Record<IdentityDirection, string[]> = {
  movement: ["Take a 10-minute walk after lunch", "Complete two short strength sessions this week"],
  nutrition: ["Build one meal each day around protein and plants", "Prepare tomorrow's lunch after dinner"],
  sleep: ["Begin a 15-minute wind-down before bed", "Keep the same wake time on five days"],
  emotional_health: ["Take five slow breaths before responding under stress", "Write down one worry and one next step each evening"],
  relationships: ["Give one person my full attention for 10 minutes", "Send one thoughtful check-in on three days"],
  focus: ["Complete one 25-minute distraction-free focus block", "Put my phone outside reach during one important task"],
  career: ["Choose tomorrow's most important work before ending the day", "Spend 20 minutes building one career skill"],
  happiness: ["Plan one small activity I genuinely enjoy", "Notice and record one good moment each day"],
  overall_health: ["Complete one small health action before noon", "Review my week for five minutes every Sunday"],
};

export function isIdentityDirection(value: unknown): value is IdentityDirection {
  return typeof value === "string" && IDENTITY_OPTIONS.some((option) => option.value === value);
}

export function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/\s+/g, " ").trim().slice(0, maxLength);
  return cleaned || null;
}

export function isSafeLifestyleAction(value: unknown): value is string {
  const cleaned = cleanText(value, 240);
  return !!cleaned && cleaned.length >= 4 && !isSafetySensitiveBlueprintAction(cleaned);
}

export function nextOnboardingStep(experiment: Pick<WeeklyExperiment, "onboarding_step" | "status">): number {
  if (experiment.status === "active") return 6;
  return Math.min(Math.max(experiment.onboarding_step + 1, 1), 6);
}

export function isReadyToActivate(experiment: Partial<WeeklyExperiment>): boolean {
  return isIdentityDirection(experiment.identity_direction)
    && isSafeLifestyleAction(experiment.action_label)
    && !!cleanText(experiment.cue, 160)
    && Number.isInteger(experiment.frequency_per_week)
    && Number(experiment.frequency_per_week) >= 1
    && Number(experiment.frequency_per_week) <= 7
    && !!cleanText(experiment.minimum_version, 160)
    && (experiment.reminder_preference === "none" || experiment.reminder_preference === "email");
}

export function identityLabel(value: IdentityDirection | null | undefined): string {
  return IDENTITY_OPTIONS.find((option) => option.value === value)?.label ?? "A healthier version of myself";
}
