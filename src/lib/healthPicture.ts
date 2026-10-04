import type { ConnectedHealthSummary } from "@/lib/connectedHealth";
import type { ApprovedHealthContextHandoff } from "@/lib/healthContextHandoff";
import { importedLabDescription, importedSleepDescription, type ImportedHealthSummary } from "./importedHealthContext.ts";

export type HealthPictureCheckIn = {
  sleep: number | null;
  energy: number | null;
  weight: number | null;
};

export type HealthPictureLabSummary = {
  summary: string;
  memberApproved: boolean;
  resultWindow: string | null;
};

export type HealthPictureSource = "combined" | "member_reported" | "connected_data" | "approved_handoff" | "lab_summary" | "imported_records" | "limited";

export type HealthPictureDomain = {
  key: "sleep" | "movement" | "nutrition_weight" | "overall_feeling" | "lab_balance";
  label: string;
  source: HealthPictureSource;
  sourceLabel: string;
  summary: string;
};

export type HealthPicture = {
  domains: HealthPictureDomain[];
  guidance: string;
};

export function buildHealthPicture({
  connectedHealth,
  checkIn,
  weightUnit,
  labSummary = null,
  handoff = null,
  importedRecords = null,
}: {
  connectedHealth: ConnectedHealthSummary | null;
  checkIn: HealthPictureCheckIn | null;
  weightUnit: "lb" | "kg";
  labSummary?: HealthPictureLabSummary | null;
  handoff?: ApprovedHealthContextHandoff | null;
  importedRecords?: ImportedHealthSummary | null;
}): HealthPicture {
  const latest = connectedHealth?.status === "connected" ? connectedHealth.latest : null;
  const sleepDuration = latest?.sleep_minutes == null ? null : formatMinutes(latest.sleep_minutes);
  const sleepRating = checkIn?.sleep == null ? null : sleepLabel(checkIn.sleep);
  const movementFacts = [
    latest?.exercise_minutes == null ? null : `${latest.exercise_minutes} exercise min`,
    latest?.steps == null ? null : `${latest.steps.toLocaleString("en-US")} steps`,
    latest?.active_energy_kcal == null ? null : `${Math.round(latest.active_energy_kcal).toLocaleString("en-US")} active kcal`,
  ].filter((fact): fact is string => fact != null);
  const weight = checkIn?.weight ?? latest?.weight_kg ?? null;
  const weightSummary = weight == null
    ? null
    : checkIn?.weight != null
      ? `${formatEnteredWeight(weight, weightUnit)} recorded in today’s check-in.`
      : `${formatConnectedWeight(weight, weightUnit)} shared from connected data.`;
  const feeling = checkIn?.energy == null ? null : energyLabel(checkIn.energy);
  const approvedLabSummary = handoff?.areas.lab_balance.summary.trim()
    || (labSummary?.memberApproved ? labSummary.summary.trim() : "");
  const handoffDateLabel = handoff ? formatWindow(handoff.sourceWindow.start, handoff.sourceWindow.end) : null;
  const importedSleep = importedRecords ? importedSleepDescription(importedRecords) : null;
  const importedLabs = importedRecords ? importedLabDescription(importedRecords) : null;

  const sleepToday = sleepRating && sleepDuration
    ? `You described sleep as ${sleepRating.toLowerCase()}; connected data shows ${sleepDuration}.`
    : sleepRating
      ? `You described sleep as ${sleepRating.toLowerCase()}.`
      : sleepDuration
        ? `Connected data shows ${sleepDuration}. Add how it felt before LVE360 interprets the day.`
        : null;
  const exerciseToday = movementFacts.length
    ? `${movementFacts.join(" · ")}. LVE360 treats these as context, not a daily grade.`
    : null;
  const weightToday = weightSummary
    ? `${weightSummary} Food quality and eating context are never inferred from weight.`
    : null;
  const feelingToday = feeling
    ? `You reported ${feeling.toLowerCase()} energy. Emotional wellbeing remains self-described, never inferred from activity or sleep.`
    : null;

  return {
    domains: [
      {
        key: "sleep",
        label: "Sleep",
        source: importedSleep ? (sleepToday || handoff ? "combined" : "imported_records") : handoffSource(sourceFor(sleepRating != null, sleepDuration != null), sleepToday != null, handoff != null),
        sourceLabel: importedSleep ? (sleepToday ? "Today + historical records" : handoff ? "Approved + historical records" : "Historical imported records") : handoffSourceLabel(sourceLabel(sleepRating != null, sleepDuration != null), sleepToday != null, handoff != null),
        summary: `${withApprovedContext(sleepToday ?? "No sleep context has been shared for today.", handoff?.areas.sleep.summary, handoffDateLabel)}${importedSleep ? ` Historical imported context: ${importedSleep}` : ""}`,
      },
      {
        key: "movement",
        label: "Exercise",
        source: handoffSource(movementFacts.length ? "connected_data" : "limited", exerciseToday != null, handoff != null),
        sourceLabel: handoffSourceLabel(movementFacts.length ? "Connected data" : "Needs context", exerciseToday != null, handoff != null),
        summary: withApprovedContext(exerciseToday ?? "No activity summary has been shared. LVE360 will not guess from an incomplete day.", handoff?.areas.exercise.summary, handoffDateLabel),
      },
      {
        key: "nutrition_weight",
        label: "Diet & weight",
        source: handoffSource(weightSummary ? (checkIn?.weight != null ? "member_reported" : "connected_data") : "limited", weightToday != null, handoff != null),
        sourceLabel: handoffSourceLabel(weightSummary ? (checkIn?.weight != null ? "Reported today" : "Connected data") : "Needs context", weightToday != null, handoff != null),
        summary: withApprovedContext(weightToday ?? "No weight or nutrition context has been shared. Food quality is never inferred from another signal.", handoff?.areas.diet_weight.summary, handoffDateLabel),
      },
      {
        key: "overall_feeling",
        label: "Overall feeling",
        source: handoffSource(feeling ? "member_reported" : "limited", feelingToday != null, handoff != null),
        sourceLabel: handoffSourceLabel(feeling ? "Reported today" : "Only you can share this", feelingToday != null, handoff != null),
        summary: withApprovedContext(feelingToday ?? "LVE360 needs your own words or check-in before using emotional or mental-health context.", handoff?.areas.overall_feeling.summary, handoffDateLabel),
      },
      {
        key: "lab_balance",
        label: "Lab balance",
        source: approvedLabSummary ? (importedLabs ? "combined" : "lab_summary") : importedLabs ? "imported_records" : "limited",
        sourceLabel: approvedLabSummary ? (importedLabs ? "Approved + archive" : "Approved lab summary") : importedLabs ? "Historical imported records" : "Needs verified results",
        summary: approvedLabSummary
          ? `${handoff ? `${formatWindow(handoff.areas.lab_balance.resultWindow.start, handoff.areas.lab_balance.resultWindow.end)}: ` : labSummary?.resultWindow ? `${labSummary.resultWindow}: ` : ""}${approvedLabSummary}${handoff ? ` Measurement context: ${handoff.areas.lab_balance.measurementContext}` : ""} This is context, not a diagnosis; review individual results with your healthcare provider.`
          : importedLabs ?? "No member-approved lab summary has been shared. Lab trends require collection dates, units, and the source laboratory’s reference ranges.",
      },
    ],
    guidance: importedRecords
      ? "Historical imported records add context, not today's state. Your current check-in stays the source of truth; missing information is never inferred from old reports."
      : checkIn
      ? `Your check-in stays the source of truth. Connected information${handoff ? " and your approved ChatGPT Health summary" : ""} can add context, but it never overrides how you say you feel.`
      : handoff
        ? "Your approved ChatGPT Health summary adds context. LVE360 still waits for your perspective before treating it as today’s state."
        : "Connected information can describe what happened. LVE360 waits for your perspective before shaping today’s focus.",
  };
}

function handoffSource(base: HealthPictureSource, hasToday: boolean, hasHandoff: boolean): HealthPictureSource {
  if (!hasHandoff) return base;
  return hasToday ? "combined" : "approved_handoff";
}

function handoffSourceLabel(base: string, hasToday: boolean, hasHandoff: boolean): string {
  if (!hasHandoff) return base;
  return hasToday ? "Today + approved summary" : "Approved summary";
}

function withApprovedContext(today: string, approved: string | undefined, window: string | null): string {
  const clean = approved?.trim();
  if (!clean) return today;
  return `${today} Approved context${window ? ` (${window})` : ""}: ${clean}`;
}

function sourceFor(reported: boolean, connected: boolean): HealthPictureSource {
  if (reported && connected) return "combined";
  if (reported) return "member_reported";
  if (connected) return "connected_data";
  return "limited";
}

function sourceLabel(reported: boolean, connected: boolean): string {
  if (reported && connected) return "Measured + reported";
  if (reported) return "Reported today";
  if (connected) return "Connected data";
  return "Needs context";
}

function sleepLabel(value: number): string {
  if (value <= 1) return "Very poor";
  if (value <= 2) return "Poor";
  if (value <= 3) return "Fair";
  if (value <= 4) return "Good";
  return "Restorative";
}

function energyLabel(value: number): string {
  if (value <= 1) return "Very low";
  if (value <= 3) return "Low";
  if (value <= 6) return "Steady";
  if (value <= 8) return "Good";
  return "High";
}

function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder === 0 ? `${hours} hr` : `${hours} hr ${remainder} min`;
}

function formatEnteredWeight(value: number, unit: "lb" | "kg"): string {
  if (unit === "kg") return `${(value * 0.45359237).toFixed(1)} kg`;
  return `${value.toFixed(1)} lb`;
}

function formatConnectedWeight(kilograms: number, unit: "lb" | "kg"): string {
  if (unit === "kg") return `${kilograms.toFixed(1)} kg`;
  return `${(kilograms * 2.2046226218).toFixed(1)} lb`;
}

function formatWindow(start: string, end: string): string {
  const formatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  const startLabel = formatter.format(new Date(`${start}T12:00:00.000Z`));
  const endLabel = formatter.format(new Date(`${end}T12:00:00.000Z`));
  return start === end ? startLabel : `${startLabel}–${endLabel}`;
}
