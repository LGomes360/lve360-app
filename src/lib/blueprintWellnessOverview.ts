import type { ConnectedHealthSummary } from "./connectedHealth";
import type { ApprovedHealthContextHandoff, HealthContextAreaKey } from "./healthContextHandoff";
import { importedLabDescription, importedSleepDescription, type ImportedHealthSummary } from "./importedHealthContext.ts";

export type OverviewCheckIn = { date: string; sleep: number | null; energy: number | null; weight: number | null };
export type BlueprintWellnessOverview = {
  asOfDate: string;
  priorities: string[];
  areas: Array<{ key: HealthContextAreaKey; label: string; records: string[]; today: string }>;
  routineNote: string;
};

const LABELS: Record<HealthContextAreaKey, string> = {
  sleep: "Sleep", exercise: "Exercise", diet_weight: "Diet & weight",
  overall_feeling: "Emotional & mental wellbeing", lab_balance: "Lab balance",
};
const KEYS = Object.keys(LABELS) as HealthContextAreaKey[];
const clean = (value: string, max = 700) => value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

export function blueprintOverviewLocalDate(now: Date, timezone: string | null | undefined): string {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone ?? "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
  const value = (key: string) => parts.find((part) => part.type === key)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

/** Bounded source descriptions, never an interpretation of current health. */
export function buildBlueprintWellnessOverview({
  asOfDate, goals = [], importedRecords = null, checkIn = null, connectedHealth = null, handoff = null,
}: {
  asOfDate: string;
  goals?: string[];
  importedRecords?: ImportedHealthSummary | null;
  checkIn?: OverviewCheckIn | null;
  connectedHealth?: ConnectedHealthSummary | null;
  handoff?: ApprovedHealthContextHandoff | null;
}): BlueprintWellnessOverview {
  const records: Record<HealthContextAreaKey, string[]> = { sleep: [], exercise: [], diet_weight: [], overall_feeling: [], lab_balance: [] };
  const pap = importedRecords?.sleep?.pap;
  const sleep = importedRecords ? importedSleepDescription(importedRecords) : null;
  const labs = importedRecords ? importedLabDescription(importedRecords) : null;
  if (sleep) records.sleep.push(`Historical imported records: ${sleep}`);
  if (labs) records.lab_balance.push(`Historical imported records: ${labs}`);
  if (importedRecords?.sourceNotes.length) {
    records.lab_balance.push("Source caveats remain attached to the archive. Review the full dated details in Today; this overview is not a complete lab explorer.");
  }
  if (pap) records.sleep.push("PAP use and oxygen recordings do not establish sleep quality, sleep duration or treatment efficacy.");
  const latest = connectedHealth?.status === "connected" ? connectedHealth.latest : null;
  if (latest) {
    const date = clean(latest.local_date, 10);
    if (latest.sleep_minutes != null) records.sleep.push(`Connected record (${date}): ${latest.sleep_minutes} sleep minutes. Duration does not establish sleep quality.`);
    const movement = [latest.steps == null ? null : `${latest.steps} steps`, latest.exercise_minutes == null ? null : `${latest.exercise_minutes} exercise minutes`].filter(Boolean);
    if (movement.length) records.exercise.push(`Connected record (${date}): ${movement.join("; ")}. This is context, not a grade or a complete activity history.`);
    if (latest.weight_kg != null) records.diet_weight.push(`Connected record (${date}): ${latest.weight_kg} kg. Food quality is not inferred from weight.`);
  }
  if (checkIn) {
    const date = clean(checkIn.date, 10);
    if (checkIn.sleep != null) records.sleep.push(`Member check-in (${date}): sleep quality ${checkIn.sleep}/5.`);
    if (checkIn.energy != null) records.overall_feeling.push(`Member check-in (${date}): energy ${checkIn.energy}/10. Energy is not an emotional or mental-health assessment.`);
    // Logs store pounds regardless of the display-unit preference.
    if (checkIn.weight != null) records.diet_weight.push(`Member check-in (${date}): ${checkIn.weight} lb. Weight does not describe diet or eating context.`);
  }
  if (handoff?.memberApproved === true) {
    for (const key of KEYS) {
      const area = handoff.areas[key];
      const window = key === "lab_balance" ? handoff.areas.lab_balance.resultWindow : handoff.sourceWindow;
      records[key].push(`Member-approved summary (${clean(window.start, 10)}–${clean(window.end, 10)}; approved snapshot ${clean(handoff.snapshotDate, 10)}): ${clean(area.summary)} Completeness: ${clean(area.dataCompleteness, 200)}`);
      if (key === "lab_balance") records[key].push(`Measurement context: ${clean(handoff.areas.lab_balance.measurementContext)}. This is not a diagnosis or confirmation that results are balanced.`);
    }
  }
  const isToday = checkIn?.date === asOfDate;
  const today: Record<HealthContextAreaKey, string> = {
    sleep: isToday && checkIn.sleep != null ? "You shared sleep quality for this date; older device records do not override it." : "Sleep quality for today is not established by the available records. An optional check-in can add your perspective.",
    exercise: latest?.local_date === asOfDate && (latest.steps != null || latest.exercise_minutes != null) ? "Dated activity is available for today; effort, exercise quality and recovery are not inferred." : "Today's exercise and recovery are not established by older records or a stated goal.",
    diet_weight: isToday && checkIn.weight != null ? "You shared weight for this date. Diet quality, appetite and eating context still require your own description."
      : latest?.local_date === asOfDate && latest.weight_kg != null ? "A dated weight record is available for today. Diet quality, appetite and eating context are not inferred from weight."
      : "Today's weight and eating context are not established by older records or a weight goal.",
    overall_feeling: isToday && checkIn.energy != null ? "You shared energy for this date. How you feel emotionally remains yours to describe, not something LVE360 infers." : "Today's emotional wellbeing and energy are not established by labs, sleep records or activity.",
    lab_balance: "Collection dates, units, source ranges, fasting and caveats matter. Historical flags do not establish today's status or justify changing medications, hormones or supplements.",
  };
  return {
    asOfDate,
    priorities: [...new Set(goals.map((goal) => clean(goal, 100)).filter(Boolean))].slice(0, 8),
    areas: KEYS.map((key) => ({ key, label: LABELS[key], records: records[key].slice(0, 6).map((record) => clean(record, 1100)), today: today[key] })),
    routineNote: "Routine contains recorded instructions, not proof that every dose or schedule is current. Confirm missing or outdated details with the appropriate clinician. Nothing is added, stopped or acknowledged by viewing this overview.",
  };
}

export function blueprintWellnessIntroMarkdown(overview: BlueprintWellnessOverview): string {
  const safe = (value: string) => value.replace(/[\n\r|*_`#<>]/g, " ");
  return [
    "## Intro Summary", "",
    "Your Blueprint is a dated wellness reference across sleep, exercise, diet and weight, emotional and mental wellbeing, and lab balance—not a shopping list or a reading of how you feel today.", "",
    overview.priorities.length ? `Recorded priorities: ${overview.priorities.map(safe).join("; ")}. A priority is not evidence of current symptoms or progress.` : "No specific priorities were supplied to this overview; missing context is not filled in.", "",
    ...overview.areas.map((area) => `- **${area.label}:** ${area.records.length ? area.records.map(safe).join(" ") : "No dated source context is included in this report for this area."} ${safe(area.today)}`), "",
    overview.routineNote, "",
    "Start by reviewing the dated sources and sharing what is relevant today. No new supplement is required; any idea must be checked against the recorded routine and safety notes first.",
  ].join("\n");
}
