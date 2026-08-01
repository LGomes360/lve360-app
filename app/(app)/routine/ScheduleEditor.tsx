"use client";

import { CirclePlus, Trash2 } from "lucide-react";

import { localDateString, normalizeRegimenSchedule, type RegimenCadence, type RegimenSchedule } from "@/lib/regimenSchedule";

export type ScheduleDraft = {
  cadence: RegimenCadence | "";
  times: string[];
  weekdays: number[];
  interval_days: number | null;
  anchor_date: string | null;
};

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function scheduleDraft(schedule: RegimenSchedule | null | undefined): ScheduleDraft {
  return schedule ? { ...schedule, times: [...schedule.times], weekdays: [...schedule.weekdays] } : {
    cadence: "",
    times: [""],
    weekdays: [],
    interval_days: 2,
    anchor_date: localDateString(),
  };
}

export function scheduleDraftPayload(draft: ScheduleDraft): RegimenSchedule | null {
  if (!draft.cadence) return null;
  return normalizeRegimenSchedule(draft);
}

export function scheduleDraftIsReady(draft: ScheduleDraft): boolean {
  try {
    return Boolean(scheduleDraftPayload(draft));
  } catch {
    return false;
  }
}

export default function ScheduleEditor({ value, onChange }: { value: ScheduleDraft; onChange: (value: ScheduleDraft) => void }) {
  function setCadence(cadence: ScheduleDraft["cadence"]) {
    onChange({
      ...value,
      cadence,
      times: cadence === "as_needed" ? [] : value.times.length ? value.times : [""],
      weekdays: cadence === "weekly" ? value.weekdays.slice(0, 1) : value.weekdays,
    });
  }

  function toggleDay(day: number) {
    const selected = value.weekdays.includes(day);
    const next = selected ? value.weekdays.filter((candidate) => candidate !== day) : [...value.weekdays, day].sort();
    onChange({ ...value, weekdays: value.cadence === "weekly" && !selected ? [day] : next });
  }

  return (
    <fieldset className="mt-5 rounded-2xl border border-slate-200 p-4">
      <legend className="px-1 text-sm font-bold text-[#041B2D]">Structured schedule</legend>
      <p className="text-sm leading-6 text-slate-600">Copy the cadence and times from your existing instructions. LVE360 does not choose them for you.</p>
      <label className="mt-4 block text-sm font-bold text-[#041B2D]">
        Cadence
        <select value={value.cadence} onChange={(event) => setCadence(event.target.value as ScheduleDraft["cadence"])} className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 font-normal outline-none focus:border-[#087F72] focus:ring-2 focus:ring-[#087F72]/20">
          <option value="">Not structured yet</option>
          <option value="daily">Every day</option>
          <option value="every_n_days">Every number of days</option>
          <option value="weekdays">Selected days of the week</option>
          <option value="weekly">Once weekly</option>
          <option value="as_needed">As needed</option>
        </select>
      </label>

      {value.cadence === "every_n_days" ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-bold text-[#041B2D]">Repeat every
            <span className="mt-2 flex items-center gap-2"><input type="number" min={2} max={30} value={value.interval_days ?? 2} onChange={(event) => onChange({ ...value, interval_days: Number(event.target.value) })} className="min-h-12 w-24 rounded-xl border border-slate-300 px-3 py-2 font-normal" /><span className="font-normal text-slate-600">days</span></span>
          </label>
          <label className="text-sm font-bold text-[#041B2D]">Starting date
            <input type="date" value={value.anchor_date ?? ""} onChange={(event) => onChange({ ...value, anchor_date: event.target.value })} className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 px-3 py-2 font-normal" />
          </label>
        </div>
      ) : null}

      {value.cadence === "weekdays" || value.cadence === "weekly" ? (
        <div className="mt-4">
          <p className="text-sm font-bold text-[#041B2D]">{value.cadence === "weekly" ? "Day of the week" : "Days of the week"}</p>
          <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-7">
            {DAYS.map((label, day) => <button key={label} type="button" aria-pressed={value.weekdays.includes(day)} onClick={() => toggleDay(day)} className={`min-h-12 rounded-xl border px-2 py-3 text-sm font-bold ${value.weekdays.includes(day) ? "border-[#087F72] bg-[#EAFBF8] text-[#06695F]" : "border-slate-300 text-slate-700 hover:bg-slate-50"}`}>{label}</button>)}
          </div>
        </div>
      ) : null}

      {value.cadence && value.cadence !== "as_needed" ? (
        <div className="mt-4">
          <p className="text-sm font-bold text-[#041B2D]">Dose times</p>
          <div className="mt-2 space-y-2">
            {value.times.map((time, index) => (
              <div key={index} className="flex items-center gap-2">
                <label className="sr-only" htmlFor={`schedule-time-${index}`}>Dose time {index + 1}</label>
                <input id={`schedule-time-${index}`} type="time" value={time} onChange={(event) => onChange({ ...value, times: value.times.map((candidate, candidateIndex) => candidateIndex === index ? event.target.value : candidate) })} className="min-h-12 flex-1 rounded-xl border border-slate-300 px-4 py-3" />
                {value.times.length > 1 ? <button type="button" onClick={() => onChange({ ...value, times: value.times.filter((_, candidateIndex) => candidateIndex !== index) })} className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-xl border border-slate-300 text-slate-600 hover:bg-slate-50" aria-label={`Remove dose time ${index + 1}`}><Trash2 className="h-5 w-5" aria-hidden="true" /></button> : null}
              </div>
            ))}
          </div>
          {value.times.length < 6 ? <button type="button" onClick={() => onChange({ ...value, times: [...value.times, ""] })} className="mt-2 inline-flex min-h-12 items-center rounded-xl px-3 py-2 font-bold text-[#087F72] hover:bg-[#EAFBF8]"><CirclePlus className="mr-2 h-5 w-5" aria-hidden="true" /> Add another time</button> : null}
        </div>
      ) : null}

      {value.cadence === "as_needed" ? <p className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">As-needed items do not create scheduled or overdue occurrences. You can record a dose only when you choose to take it under your existing instructions.</p> : null}
    </fieldset>
  );
}
