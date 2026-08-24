"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Loader2, Mail, Sparkles } from "lucide-react";

import {
  IDENTITY_OPTIONS,
  STARTER_ACTIONS,
  identityLabel,
  nextOnboardingStep,
  type IdentityDirection,
  type ReminderPreference,
  type WeeklyExperiment,
} from "@/lib/activation";
import { isQuietHour, type ReminderTiming } from "@/lib/reminderSchedule";
import type { PracticeGoalOption } from "@/lib/practiceConnection";
import { formatPracticeCue, formatPracticeQuantity, isUsableMinimumVersionText, normalizePracticeQuantityFields } from "@/lib/practiceQuantity";

type FormState = {
  identity_direction: IdentityDirection | null;
  action_label: string;
  target_quantity: number | null;
  quantity_unit: string;
  cue: string;
  frequency_per_week: number;
  minimum_version: string;
  minimum_quantity: number | null;
  minimum_quantity_unit: string;
  reminder_preference: ReminderPreference;
  reminder_timing: ReminderTiming;
  reminder_hour: number;
  timezone: string;
  goal_key: string | null;
};

type ReminderContext = {
  timezone: string;
  quiet_start_hour: number;
  quiet_end_hour: number;
};

const EMPTY_FORM: FormState = {
  identity_direction: null,
  action_label: "",
  target_quantity: null,
  quantity_unit: "",
  cue: "",
  frequency_per_week: 3,
  minimum_version: "",
  minimum_quantity: null,
  minimum_quantity_unit: "",
  reminder_preference: "none",
  reminder_timing: "at_cue",
  reminder_hour: 18,
  timezone: "UTC",
  goal_key: null,
};

export default function OnboardingHandoffClient() {
  const [experiment, setExperiment] = useState<WeeklyExperiment | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reminderContext, setReminderContext] = useState<ReminderContext>({
    timezone: "UTC",
    quiet_start_hour: 21,
    quiet_end_hour: 7,
  });
  const [goalOptions, setGoalOptions] = useState<PracticeGoalOption[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/activation", { cache: "no-store" })
      .then(async (response) => {
        const json = await response.json().catch(() => null);
        if (!response.ok || !json?.experiment) throw new Error("We could not load your weekly setup.");
        return json as { experiment: WeeklyExperiment; reminder_context?: ReminderContext; goal_options?: PracticeGoalOption[] };
      })
      .then(({ experiment: loaded, reminder_context, goal_options }) => {
        if (cancelled) return;
        setExperiment(loaded);
        const detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const context = reminder_context ?? { timezone: detectedTimezone || "UTC", quiet_start_hour: 21, quiet_end_hour: 7 };
        setReminderContext(context);
        setGoalOptions(goal_options ?? []);
        setForm({ ...formFromExperiment(loaded), timezone: context.timezone || detectedTimezone || "UTC" });
        setStep(nextOnboardingStep(loaded));
      })
      .catch((loadError) => { if (!cancelled) setError(loadError?.message ?? "Setup is unavailable."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const starterActions = form.identity_direction ? STARTER_ACTIONS[form.identity_direction] : [];

  async function saveStep() {
    const clientError = validateStep(step, form);
    if (clientError) {
      setError(clientError);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = payloadForStep(step, form);
      const response = await fetch("/api/activation", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.experiment) throw new Error(errorMessage(json?.error));
      const updated = json.experiment as WeeklyExperiment;
      setExperiment(updated);
      setForm({ ...formFromExperiment(updated), timezone: form.timezone });
      if (step < 6) setStep(step + 1);
    } catch (saveError: any) {
      setError(saveError?.message ?? "We could not save that step. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <Shell><div className="flex min-h-[360px] items-center justify-center gap-3 text-slate-600"><Loader2 className="h-5 w-5 animate-spin" /> Preparing your first week...</div></Shell>;
  }

  if (!experiment) {
    return <Shell><div className="py-16 text-center"><h1 className="text-2xl font-bold text-[#041B2D]">Setup is temporarily unavailable</h1><p className="mt-3 text-slate-600">Refresh the page or return to Today and try again.</p><a href="/today" className="mt-6 inline-flex rounded-xl bg-[#087F72] px-5 py-3 font-bold text-white">Return to Today</a></div></Shell>;
  }

  const active = experiment.status === "active";

  return (
    <Shell>
      <div className="mb-8 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#087F72]">{active ? "Your weekly practice" : "Your first weekly practice"}</p>
          <p className="mt-1 text-sm text-slate-500">{active ? "Update what needs to change" : "About three minutes"}</p>
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold text-[#041B2D]">{active && step === 6 ? "Ready" : `Step ${step} of 6`}</p>
          <div className="mt-2 flex gap-1" aria-label={`Step ${step} of 6`}>
            {[1, 2, 3, 4, 5, 6].map((item) => <span key={item} className={`h-1.5 w-7 rounded-full ${item <= step ? "bg-[#08A88A]" : "bg-slate-200"}`} />)}
          </div>
        </div>
      </div>

      {step === 1 && <IdentityStep value={form.identity_direction} onChange={(value) => setForm({ ...form, identity_direction: value })} />}
      {step === 2 && <ActionStep form={form} starterActions={starterActions} goalOptions={goalOptions} fromBlueprint={!!experiment.source_action_id && form.action_label === experiment.action_label} onChange={(changes) => setForm({ ...form, ...changes })} />}
      {step === 3 && <CueStep form={form} onChange={(changes) => setForm({ ...form, ...changes })} />}
      {step === 4 && <MinimumStep form={form} onChange={(changes) => setForm({ ...form, ...changes })} />}
      {step === 5 && (
        <ReminderStep
          preference={form.reminder_preference}
          timing={form.reminder_timing}
          reminderHour={form.reminder_hour}
          timezone={form.timezone}
          quietStartHour={reminderContext.quiet_start_hour}
          quietEndHour={reminderContext.quiet_end_hour}
          onChange={(changes) => setForm({ ...form, ...changes })}
        />
      )}
      {step === 6 && <ConfirmationStep form={form} active={active} goalOptions={goalOptions} fromBlueprint={!!experiment.source_action_id} onEditPlan={() => setStep(1)} onEditReminders={() => setStep(5)} />}

      {error && <p className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</p>}

      <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        {step > 1 && !(active && step === 6) ? (
          <button type="button" onClick={() => { setError(null); setStep(step - 1); }} className="inline-flex items-center justify-center rounded-xl px-4 py-3 font-semibold text-slate-600 hover:bg-slate-100">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </button>
        ) : <span />}
        {active && step === 6 ? (
          <a href="/today" className="inline-flex items-center justify-center rounded-xl bg-[#08A88A] px-6 py-3 font-bold text-white shadow-sm hover:bg-[#078B74]">Open Today <ArrowRight className="ml-2 h-5 w-5" /></a>
        ) : (
          <button type="button" onClick={saveStep} disabled={saving} className="inline-flex items-center justify-center rounded-xl bg-[#08A88A] px-6 py-3 font-bold text-white shadow-sm hover:bg-[#078B74] disabled:opacity-60">
            {saving ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null}
            {active && step === 5 ? "Save reminder plan" : step === 6 ? "Start my week" : "Save and continue"} <ArrowRight className="ml-2 h-5 w-5" />
          </button>
        )}
      </div>

      <p className="mt-8 border-t border-slate-100 pt-5 text-xs leading-5 text-slate-500">
        This setup is for lifestyle practices only. Supplement and medication changes remain in your Blueprint for clinician or healthcare provider review.
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="min-h-screen bg-gradient-to-br from-[#EAFBF8] via-white to-[#F8F5FB] px-4 py-10 sm:px-6 sm:py-16"><div className="mx-auto max-w-2xl rounded-3xl border border-[#CDE9E3] bg-white p-6 shadow-xl sm:p-10">{children}</div></main>;
}

function IdentityStep({ value, onChange }: { value: IdentityDirection | null; onChange: (value: IdentityDirection) => void }) {
  return <section><Sparkles className="h-8 w-8 text-[#08A88A]" /><h1 className="mt-4 text-3xl font-extrabold tracking-tight text-[#041B2D]">Who are you becoming?</h1><p className="mt-3 leading-7 text-slate-600">Choose the identity you want this week&apos;s practice to reinforce.</p><div className="mt-6 grid gap-3 sm:grid-cols-2">{IDENTITY_OPTIONS.map((option) => <button key={option.value} type="button" onClick={() => onChange(option.value)} aria-pressed={value === option.value} className={`flex min-h-16 items-center justify-between rounded-2xl border px-4 py-3 text-left font-semibold transition ${value === option.value ? "border-[#08A88A] bg-[#EAFBF8] text-[#041B2D] ring-2 ring-[#08A88A]/20" : "border-slate-200 text-slate-700 hover:border-[#9DCFC3]"}`}><span>{option.label}</span>{value === option.value ? <Check className="h-5 w-5 text-[#087F72]" /> : null}</button>)}</div></section>;
}

function ActionStep({ form, starterActions, goalOptions, fromBlueprint, onChange }: { form: FormState; starterActions: string[]; goalOptions: PracticeGoalOption[]; fromBlueprint: boolean; onChange: (changes: Partial<FormState>) => void }) {
  return (
    <section>
      <h1 className="text-3xl font-extrabold tracking-tight text-[#041B2D]">Choose one practice for this week</h1>
      <p className="mt-3 leading-7 text-slate-600">Small enough to repeat. Specific enough to know when you did it.</p>
      {fromBlueprint && form.action_label ? <div className="mt-6 rounded-2xl border border-[#9DCFC3] bg-[#EAFBF8] p-4"><p className="text-xs font-bold uppercase tracking-[0.14em] text-[#087F72]">Selected from your Blueprint</p><p className="mt-2 font-semibold text-[#041B2D]">{form.action_label}</p></div> : null}
      <div className="mt-5 grid gap-3">{starterActions.map((action) => <button key={action} type="button" onClick={() => onChange({ action_label: action })} aria-pressed={form.action_label === action} className={`flex items-center justify-between rounded-2xl border p-4 text-left font-semibold ${form.action_label === action ? "border-[#08A88A] bg-[#EAFBF8]" : "border-slate-200 hover:border-[#9DCFC3]"}`}><span>{action}</span>{form.action_label === action ? <Check className="h-5 w-5 text-[#087F72]" /> : null}</button>)}</div>
      <label className="mt-5 block text-sm font-bold text-[#041B2D]" htmlFor="weekly-action">Or write your own lifestyle practice</label>
      <textarea id="weekly-action" rows={3} maxLength={240} value={form.action_label} onChange={(event) => onChange({ action_label: event.target.value })} placeholder="Take a 10-minute walk after lunch" className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-[#08A88A] focus:ring-2 focus:ring-[#08A88A]/20" />

      <fieldset className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <legend className="px-1 text-sm font-bold text-[#041B2D]">Target each time <span className="font-normal text-slate-500">(optional)</span></legend>
        <p className="mt-1 text-sm leading-6 text-slate-600">Record quantity separately from how often you plan to practice. Leave this blank for habits such as meditation.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-bold text-[#041B2D]" htmlFor="target-quantity">Amount
            <input id="target-quantity" type="number" inputMode="decimal" min="0.01" max="100000" step="0.01" value={form.target_quantity ?? ""} onChange={(event) => onChange({ target_quantity: optionalNumber(event.target.value) })} placeholder="10" className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 font-normal" />
          </label>
          <label className="text-sm font-bold text-[#041B2D]" htmlFor="quantity-unit">Unit
            <input id="quantity-unit" maxLength={40} value={form.quantity_unit} onChange={(event) => onChange({ quantity_unit: event.target.value })} placeholder="sit-ups, minutes, laps" className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 font-normal" />
          </label>
        </div>
      </fieldset>

      <fieldset className="mt-7 border-t border-slate-200 pt-6"><legend className="text-lg font-bold text-[#041B2D]">Why does this practice matter this week?</legend><p className="mt-2 text-sm leading-6 text-slate-600">Choose a saved goal when there is a real connection. Otherwise, keep it as an independent choice.</p><div className="mt-4 grid gap-3"><ConnectionChoice selected={form.goal_key === null} title="Independent choice for this week" onClick={() => onChange({ goal_key: null })} />{goalOptions.map((goal) => <ConnectionChoice key={goal.key} selected={form.goal_key === goal.key} title={goal.label} eyebrow="Supports saved goal" onClick={() => onChange({ goal_key: goal.key })} />)}</div>{!goalOptions.length ? <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">No saved goals are available yet. This practice will remain an independent choice.</p> : null}</fieldset>
    </section>
  );
}

function ConnectionChoice({ selected, title, eyebrow, onClick }: { selected: boolean; title: string; eyebrow?: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} aria-pressed={selected} className={`flex items-center justify-between rounded-2xl border p-4 text-left ${selected ? "border-[#08A88A] bg-[#EAFBF8]" : "border-slate-200 hover:border-[#9DCFC3]"}`}><span>{eyebrow ? <span className="block text-xs font-bold uppercase tracking-[0.12em] text-[#087F72]">{eyebrow}</span> : null}<span className={`${eyebrow ? "mt-1 " : ""}block font-semibold text-[#041B2D]`}>{title}</span></span>{selected ? <Check className="h-5 w-5 shrink-0 text-[#087F72]" /> : null}</button>;
}

function CueStep({ form, onChange }: { form: FormState; onChange: (changes: Partial<FormState>) => void }) {
  return <section><h1 className="text-3xl font-extrabold tracking-tight text-[#041B2D]">Give your practice a clear cue</h1><p className="mt-3 leading-7 text-slate-600">Connect it to something that already happens in your day.</p><label className="mt-6 block text-sm font-bold text-[#041B2D]" htmlFor="cue">After I...</label><input id="cue" maxLength={160} value={form.cue} onChange={(event) => onChange({ cue: event.target.value })} placeholder="put away my lunch" className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-[#08A88A] focus:ring-2 focus:ring-[#08A88A]/20" /><label className="mt-6 block text-sm font-bold text-[#041B2D]" htmlFor="frequency-per-week">Times per week<input id="frequency-per-week" type="number" inputMode="numeric" min={1} max={7} step={1} value={form.frequency_per_week} onChange={(event) => onChange({ frequency_per_week: Number(event.target.value) })} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 font-normal" /><span className="mt-2 block font-normal leading-6 text-slate-500">How many times would you like to complete this practice each week?</span></label></section>;
}

function MinimumStep({ form, onChange }: { form: FormState; onChange: (changes: Partial<FormState>) => void }) {
  return <section><h1 className="text-3xl font-extrabold tracking-tight text-[#041B2D]">Make it work on a hard day</h1><p className="mt-3 leading-7 text-slate-600">Define the smallest version that still counts. You can always do more.</p><div className="mt-6 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600"><span className="font-bold text-[#041B2D]">Your practice:</span> {form.action_label}</div><label className="mt-5 block text-sm font-bold text-[#041B2D]" htmlFor="minimum-version">My minimum version is...</label><input id="minimum-version" maxLength={160} value={form.minimum_version} onChange={(event) => onChange({ minimum_version: event.target.value })} placeholder="Walk for two minutes" className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-[#08A88A] focus:ring-2 focus:ring-[#08A88A]/20" /><div className="mt-4 flex flex-wrap gap-2">{["Do it for two minutes", "Complete one repetition", "Take the first small step"].map((minimum) => <button key={minimum} type="button" onClick={() => onChange({ minimum_version: minimum })} className="rounded-full border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:border-[#9DCFC3] hover:bg-[#EAFBF8]">{minimum}</button>)}</div><fieldset className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4"><legend className="px-1 text-sm font-bold text-[#041B2D]">Minimum quantity <span className="font-normal text-slate-500">(optional)</span></legend><p className="mt-1 text-sm leading-6 text-slate-600">Add a number only when the hard-day version has a measurable amount.</p><div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="text-sm font-bold text-[#041B2D]" htmlFor="minimum-quantity">Amount<input id="minimum-quantity" type="number" inputMode="decimal" min="0.01" max="100000" step="0.01" value={form.minimum_quantity ?? ""} onChange={(event) => onChange({ minimum_quantity: optionalNumber(event.target.value) })} placeholder="3" className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 font-normal" /></label><label className="text-sm font-bold text-[#041B2D]" htmlFor="minimum-quantity-unit">Unit<input id="minimum-quantity-unit" maxLength={40} value={form.minimum_quantity_unit} onChange={(event) => onChange({ minimum_quantity_unit: event.target.value })} placeholder={form.quantity_unit || "sit-ups, seconds"} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 font-normal" /><span className="mt-2 block font-normal text-slate-500">Leave blank to use {form.quantity_unit || "the target unit"}.</span></label></div></fieldset></section>;
}

function ReminderStep({
  preference,
  timing,
  reminderHour,
  timezone,
  quietStartHour,
  quietEndHour,
  onChange,
}: {
  preference: ReminderPreference;
  timing: ReminderTiming;
  reminderHour: number;
  timezone: string;
  quietStartHour: number;
  quietEndHour: number;
  onChange: (changes: Partial<Pick<FormState, "reminder_preference" | "reminder_timing" | "reminder_hour">>) => void;
}) {
  const options: Array<{
    preference: ReminderPreference;
    timing: ReminderTiming;
    title: string;
    copy: string;
    defaultHour?: number;
  }> = [
    { preference: "email", timing: "prepare_before", title: "Help me prepare beforehand", copy: "Send a setup cue before the moment so the practice is easier later.", defaultHour: 20 },
    { preference: "email", timing: "at_cue", title: "Remind me at the cue", copy: "Send the practice and its minimum version when I plan to act.", defaultHour: 18 },
    { preference: "email", timing: "next_day", title: "Check in the next morning", copy: "Useful for bedtime or phone-free practices. Record it the next day without reopening your phone afterward.", defaultHour: 8 },
    { preference: "none", timing: "at_cue", title: "No reminder for this practice", copy: "I will use my own cue and dashboard." },
  ];
  return (
    <section>
      <Mail className="h-8 w-8 text-[#08A88A]" />
      <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-[#041B2D]">When would support actually help?</h1>
      <p className="mt-3 leading-7 text-slate-600">Match the email to this practice. A bedtime habit can use an earlier preparation cue or a next-morning check-in so your phone stays out of the routine.</p>
      <div className="mt-6 grid gap-3">
        {options.map((option) => {
          const selected = preference === option.preference && (option.preference === "none" || timing === option.timing);
          return (
          <button key={`${option.preference}:${option.timing}`} type="button" onClick={() => onChange({ reminder_preference: option.preference, reminder_timing: option.timing, ...(option.defaultHour ? { reminder_hour: option.defaultHour } : {}) })} aria-pressed={selected} className={`flex items-center justify-between rounded-2xl border p-5 text-left ${selected ? "border-[#08A88A] bg-[#EAFBF8]" : "border-slate-200 hover:border-[#9DCFC3]"}`}>
            <span><span className="block font-bold text-[#041B2D]">{option.title}</span><span className="mt-1 block text-sm text-slate-600">{option.copy}</span></span>
            {selected ? <Check className="h-5 w-5 text-[#087F72]" /> : null}
          </button>
        )})}
      </div>
      {preference === "email" && timing !== "account_default" && (
        <label className="mt-5 block text-sm font-bold text-[#041B2D]">
          {timing === "next_day" ? "Check in around" : timing === "prepare_before" ? "Help me prepare around" : "Send at"}
          <select value={reminderHour} onChange={(event) => onChange({ reminder_hour: Number(event.target.value) })} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 font-normal">
            {Array.from({ length: 24 }, (_, hour) => hour).filter((hour) => !isQuietHour(hour, quietStartHour, quietEndHour)).map((hour) => (
              <option key={hour} value={hour}>{new Intl.DateTimeFormat("en-US", { hour: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(2026, 0, 1, hour)))}</option>
            ))}
          </select>
          <span className="mt-2 block font-normal text-slate-500">Local time in {timezone}. Your quiet hours are {formatHour(quietStartHour)} to {formatHour(quietEndHour)}.</span>
        </label>
      )}
      {preference === "email" && timing === "account_default" ? <p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">This existing practice uses your account default time. Choose another option above to tailor it.</p> : null}
    </section>
  );
}

function ConfirmationStep({ form, active, goalOptions, fromBlueprint, onEditPlan, onEditReminders }: { form: FormState; active: boolean; goalOptions: PracticeGoalOption[]; fromBlueprint: boolean; onEditPlan: () => void; onEditReminders: () => void }) {
  const goal = goalOptions.find((option) => option.key === form.goal_key) ?? null;
  const connection = [goal ? `Supports saved goal: ${goal.label}` : null, fromBlueprint ? "Supports a selected Blueprint priority" : null].filter(Boolean).join(" · ") || "Independently chosen for this week";
  const target = form.target_quantity != null && form.quantity_unit ? formatPracticeQuantity(form.target_quantity, form.quantity_unit) : "No quantity recorded";
  const minimumUnit = form.minimum_quantity_unit || form.quantity_unit;
  const minimum = isUsableMinimumVersionText(form.minimum_version)
    ? form.minimum_quantity != null && minimumUnit
      ? `${form.minimum_version} (${formatPracticeQuantity(form.minimum_quantity, minimumUnit)})`
      : form.minimum_version
    : "Needs review before it can count";
  return <section><CheckCircle2 className="h-10 w-10 text-[#08A88A]" /><h1 className="mt-4 text-3xl font-extrabold tracking-tight text-[#041B2D]">{active ? "Your week is active" : "Your first week is ready"}</h1><p className="mt-3 leading-7 text-slate-600">Use this plan while it fits your life. You can change it when your schedule or priorities change.</p><div className="mt-6 space-y-4 rounded-2xl border border-[#9DCFC3] bg-[#EAFBF8] p-5"><Summary label="This week's direction" value={identityLabel(form.identity_direction)} /><Summary label="This week I will" value={form.action_label} /><Summary label="Target each time" value={target} /><Summary label="Why it matters" value={connection} /><Summary label="My cue" value={formatPracticeCue(form.cue)} /><Summary label="Times per week" value={`${form.frequency_per_week} planned ${form.frequency_per_week === 1 ? "completion" : "completions"}`} /><Summary label="On a hard day" value={minimum} /><Summary label="Reminder plan" value={reminderSummary(form)} /></div>{active ? <div className="mt-5 flex flex-wrap gap-3"><button type="button" onClick={onEditPlan} className="min-h-11 rounded-xl bg-[#087F72] px-4 py-2 font-bold text-white hover:bg-[#06695F]">Edit weekly plan</button><button type="button" onClick={onEditReminders} className="min-h-11 rounded-xl border border-[#9DCFC3] px-4 py-2 font-bold text-[#087F72] hover:bg-[#EAFBF8]">Change reminder plan</button></div> : null}</section>;
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs font-bold uppercase tracking-[0.13em] text-[#087F72]">{label}</p><p className="mt-1 font-semibold leading-6 text-[#041B2D]">{value}</p></div>;
}

function formFromExperiment(experiment: WeeklyExperiment): FormState {
  return {
    identity_direction: experiment.identity_direction,
    action_label: experiment.action_label ?? "",
    target_quantity: experiment.target_quantity ?? null,
    quantity_unit: experiment.quantity_unit ?? "",
    cue: experiment.cue ?? "",
    frequency_per_week: experiment.frequency_per_week ?? 3,
    minimum_version: experiment.minimum_version ?? "",
    minimum_quantity: experiment.minimum_quantity ?? null,
    minimum_quantity_unit: experiment.minimum_quantity_unit ?? "",
    reminder_preference: experiment.reminder_preference ?? "none",
    reminder_timing: experiment.reminder_timing ?? "account_default",
    reminder_hour: experiment.reminder_hour ?? 18,
    timezone: "UTC",
    goal_key: experiment.goal_key ?? null,
  };
}

function payloadForStep(step: number, form: FormState) {
  if (step === 1) return { step, identity_direction: form.identity_direction };
  if (step === 2) return { step, action_label: form.action_label, goal_key: form.goal_key, target_quantity: form.target_quantity, quantity_unit: form.quantity_unit || null };
  if (step === 3) return { step, cue: form.cue, frequency_per_week: form.frequency_per_week };
  if (step === 4) return { step, minimum_version: form.minimum_version, minimum_quantity: form.minimum_quantity, minimum_quantity_unit: form.minimum_quantity == null ? null : form.minimum_quantity_unit || form.quantity_unit || null };
  if (step === 5) return {
    step,
    reminder_preference: form.reminder_preference,
    reminder_timing: form.reminder_timing,
    reminder_hour: form.reminder_hour,
    timezone: form.timezone,
  };
  return { step: 6 };
}

function errorMessage(code: string | undefined) {
  if (code === "choose_identity") return "Choose the identity you want to reinforce.";
  if (code === "choose_safe_lifestyle_action") return "Choose a lifestyle action. Supplement and medication changes stay in your Blueprint for professional review.";
  if (code === "add_valid_target_quantity") return "Enter both a positive target amount and its unit, or leave both blank.";
  if (code === "choose_current_goal") return "That saved goal is no longer available. Choose another goal or keep this as an independent weekly choice.";
  if (code === "add_cue_and_frequency") return "Add a clear cue and choose how many days you want to practice.";
  if (code === "add_safe_minimum_version") return "Add a small lifestyle version that can count on a hard day.";
  if (code === "add_valid_minimum_quantity") return "Enter a positive minimum amount and unit, or leave the structured minimum blank.";
  if (code === "choose_reminder_timing") return "Choose when reminder support would be useful for this practice.";
  if (code === "choose_reminder_time") return "Choose a valid local reminder time.";
  if (code === "reminder_in_quiet_hours") return "Choose a reminder time outside the quiet hours saved in Settings.";
  if (code === "complete_required_steps") return "One of the earlier steps is incomplete. Go back and review your plan.";
  return "We could not save that step. Please try again.";
}

function optionalNumber(value: string): number | null {
  return value === "" ? null : Number(value);
}

function validateStep(step: number, form: FormState): string | null {
  if (step === 2) {
    const quantity = normalizePracticeQuantityFields({
      target_quantity: form.target_quantity,
      quantity_unit: form.quantity_unit,
      minimum_quantity: null,
      minimum_quantity_unit: null,
    });
    if (!quantity.ok) return "Enter both a positive target amount and its unit, or leave both blank.";
  }
  if (step === 3 && (!Number.isInteger(form.frequency_per_week) || form.frequency_per_week < 1 || form.frequency_per_week > 7)) {
    return "Choose a weekly frequency from 1 to 7 times.";
  }
  if (step === 4) {
    if (!isUsableMinimumVersionText(form.minimum_version)) {
      return "Describe a concrete action that still counts on a hard day, such as walking for two minutes or completing one repetition.";
    }
    const quantity = normalizePracticeQuantityFields({
      target_quantity: form.target_quantity,
      quantity_unit: form.quantity_unit,
      minimum_quantity: form.minimum_quantity,
      minimum_quantity_unit: form.minimum_quantity_unit || form.quantity_unit,
    });
    if (!quantity.ok) return "Enter a positive minimum amount and unit, or leave the structured minimum blank.";
  }
  return null;
}

function reminderSummary(form: FormState): string {
  if (form.reminder_preference === "none") return "No email for this practice";
  if (form.reminder_timing === "account_default") return "Use my account default";
  const time = new Intl.DateTimeFormat("en-US", { hour: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(2026, 0, 1, form.reminder_hour)));
  if (form.reminder_timing === "prepare_before") return `Prepare beforehand around ${time}`;
  if (form.reminder_timing === "next_day") return `Check in the next morning around ${time}`;
  return `Remind me at the cue around ${time}`;
}

function formatHour(hour: number): string {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(2026, 0, 1, hour)));
}
