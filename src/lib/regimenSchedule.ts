export const REGIMEN_CADENCES = ["daily", "every_n_days", "weekdays", "weekly", "as_needed"] as const;

export type RegimenCadence = (typeof REGIMEN_CADENCES)[number];

export type RegimenSchedule = {
  cadence: RegimenCadence;
  times: string[];
  weekdays: number[];
  interval_days: number | null;
  anchor_date: string | null;
};

export type DoseSlot = {
  slotKey: string;
  time: string;
  label: string;
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function validDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

export function isLocalDate(value: unknown): value is string {
  return typeof value === "string" && validDate(value);
}

export function localDateString(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function normalizeRegimenSchedule(value: unknown): RegimenSchedule {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_regimen_schedule");
  const input = value as Record<string, unknown>;
  const cadence = input.cadence;
  if (typeof cadence !== "string" || !REGIMEN_CADENCES.includes(cadence as RegimenCadence)) {
    throw new Error("invalid_regimen_cadence");
  }

  const times = Array.isArray(input.times)
    ? [...new Set(input.times.filter((time): time is string => typeof time === "string").map((time) => time.trim()))].sort()
    : [];
  if (times.some((time) => !TIME_PATTERN.test(time)) || times.length > 6) throw new Error("invalid_regimen_times");

  const weekdays = Array.isArray(input.weekdays)
    ? [...new Set(input.weekdays.filter((day): day is number => Number.isInteger(day) && day >= 0 && day <= 6))].sort()
    : [];
  const intervalDays = typeof input.interval_days === "number" && Number.isInteger(input.interval_days)
    ? input.interval_days
    : null;
  const anchorDate = typeof input.anchor_date === "string" && validDate(input.anchor_date)
    ? input.anchor_date
    : null;

  if (cadence !== "as_needed" && (times.length < 1 || times.length > 6)) throw new Error("regimen_time_required");
  if (cadence === "weekdays" && weekdays.length < 1) throw new Error("regimen_weekday_required");
  if (cadence === "weekly" && weekdays.length !== 1) throw new Error("regimen_weekly_day_required");
  if (cadence === "every_n_days" && (!intervalDays || intervalDays < 2 || intervalDays > 30 || !anchorDate)) {
    throw new Error("regimen_interval_required");
  }

  return {
    cadence: cadence as RegimenCadence,
    times: cadence === "as_needed" ? [] : times,
    weekdays: cadence === "weekdays" || cadence === "weekly" ? weekdays : [],
    interval_days: cadence === "every_n_days" ? intervalDays : null,
    anchor_date: cadence === "every_n_days" ? anchorDate : null,
  };
}

export function regimenScheduleLabel(schedule: RegimenSchedule): string {
  if (schedule.cadence === "as_needed") return "As needed, using your recorded instructions";
  const times = schedule.times.map(formatTime).join(" and ");
  if (schedule.cadence === "daily") return `Daily at ${times}`;
  if (schedule.cadence === "weekdays") {
    return `${schedule.weekdays.map((day) => DAY_LABELS[day]).join(", ")} at ${times}`;
  }
  if (schedule.cadence === "weekly") return `Weekly on ${DAY_LABELS[schedule.weekdays[0]]} at ${times}`;
  return `Every ${schedule.interval_days} days from ${formatDate(schedule.anchor_date!)} at ${times}`;
}

export function canonicalRegimenTiming(item: {
  schedule?: RegimenSchedule | null;
  timing?: string | null;
}): string | null {
  if (item.schedule) return regimenScheduleLabel(item.schedule);
  return item.timing?.trim() || null;
}

export function isRegimenScheduleDue(schedule: RegimenSchedule, date: string): boolean {
  if (!validDate(date) || schedule.cadence === "as_needed") return false;
  const day = dateDay(date);
  if (schedule.cadence === "daily") return true;
  if (schedule.cadence === "weekdays" || schedule.cadence === "weekly") return schedule.weekdays.includes(day);
  const elapsed = daysBetween(schedule.anchor_date!, date);
  return elapsed >= 0 && elapsed % schedule.interval_days! === 0;
}

export function regimenDoseSlots(schedule: RegimenSchedule, date: string): DoseSlot[] {
  if (!isRegimenScheduleDue(schedule, date)) return [];
  return schedule.times.map((time) => ({ slotKey: time, time, label: formatTime(time) }));
}

export function formatTime(value: string): string {
  const [hour, minute] = value.split(":").map(Number);
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function dateDay(value: string): number {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function daysBetween(start: string, end: string): number {
  const startMs = Date.parse(`${start}T00:00:00Z`);
  const endMs = Date.parse(`${end}T00:00:00Z`);
  return Math.floor((endMs - startMs) / 86_400_000);
}

function formatDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, month - 1, day)));
}
