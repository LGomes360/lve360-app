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

type FormState = {
  identity_direction: IdentityDirection | null;
  action_label: string;
  cue: string;
  frequency_per_week: number;
  minimum_version: string;
  reminder_preference: ReminderPreference;
};

const EMPTY_FORM: FormState = {
  identity_direction: null,
  action_label: "",
  cue: "",
  frequency_per_week: 3,
  minimum_version: "",
  reminder_preference: "none",
};

export default function OnboardingHandoffClient() {
  const [experiment, setExperiment] = useState<WeeklyExperiment | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/activation", { cache: "no-store" })
      .then(async (response) => {
        const json = await response.json().catch(() => null);
        if (!response.ok || !json?.experiment) throw new Error("We could not load your first-week setup.");
        return json.experiment as WeeklyExperiment;
      })
      .then((loaded) => {
        if (cancelled) return;
        setExperiment(loaded);
        setForm(formFromExperiment(loaded));
        setStep(nextOnboardingStep(loaded));
      })
      .catch((loadError) => { if (!cancelled) setError(loadError?.message ?? "Setup is unavailable."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const starterActions = form.identity_direction ? STARTER_ACTIONS[form.identity_direction] : [];

  async function saveStep() {
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
      setForm(formFromExperiment(updated));
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
    return <Shell><div className="py-16 text-center"><h1 className="text-2xl font-bold text-[#041B2D]">Setup is temporarily unavailable</h1><p className="mt-3 text-slate-600">Refresh the page or return to your dashboard and try again.</p><a href="/dashboard" className="mt-6 inline-flex rounded-xl bg-[#087F72] px-5 py-3 font-bold text-white">Return to dashboard</a></div></Shell>;
  }

  const active = experiment.status === "active";

  return (
    <Shell>
      <div className="mb-8 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#087F72]">Your first week</p>
          <p className="mt-1 text-sm text-slate-500">About three minutes</p>
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold text-[#041B2D]">{active ? "Ready" : `Step ${step} of 6`}</p>
          <div className="mt-2 flex gap-1" aria-label={`Step ${step} of 6`}>
            {[1, 2, 3, 4, 5, 6].map((item) => <span key={item} className={`h-1.5 w-7 rounded-full ${item <= step ? "bg-[#08A88A]" : "bg-slate-200"}`} />)}
          </div>
        </div>
      </div>

      {step === 1 && <IdentityStep value={form.identity_direction} onChange={(value) => setForm({ ...form, identity_direction: value })} />}
      {step === 2 && <ActionStep form={form} starterActions={starterActions} fromBlueprint={!!experiment.source_action_id} onChange={(action_label) => setForm({ ...form, action_label })} />}
      {step === 3 && <CueStep form={form} onChange={(changes) => setForm({ ...form, ...changes })} />}
      {step === 4 && <MinimumStep value={form.minimum_version} action={form.action_label} onChange={(minimum_version) => setForm({ ...form, minimum_version })} />}
      {step === 5 && <ReminderStep value={form.reminder_preference} onChange={(reminder_preference) => setForm({ ...form, reminder_preference })} />}
      {step === 6 && <ConfirmationStep form={form} active={active} />}

      {error && <p className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</p>}

      <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        {!active && step > 1 ? (
          <button type="button" onClick={() => { setError(null); setStep(step - 1); }} className="inline-flex items-center justify-center rounded-xl px-4 py-3 font-semibold text-slate-600 hover:bg-slate-100">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </button>
        ) : <span />}
        {active ? (
          <a href="/dashboard" className="inline-flex items-center justify-center rounded-xl bg-[#08A88A] px-6 py-3 font-bold text-white shadow-sm hover:bg-[#078B74]">Open my dashboard <ArrowRight className="ml-2 h-5 w-5" /></a>
        ) : (
          <button type="button" onClick={saveStep} disabled={saving} className="inline-flex items-center justify-center rounded-xl bg-[#08A88A] px-6 py-3 font-bold text-white shadow-sm hover:bg-[#078B74] disabled:opacity-60">
            {saving ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null}
            {step === 6 ? "Start my week" : "Save and continue"} <ArrowRight className="ml-2 h-5 w-5" />
          </button>
        )}
      </div>

      <p className="mt-8 border-t border-slate-100 pt-5 text-xs leading-5 text-slate-500">
        This setup is for lifestyle practices only. Supplement and medication changes remain in your Blueprint for clinician or pharmacist review.
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

function ActionStep({ form, starterActions, fromBlueprint, onChange }: { form: FormState; starterActions: string[]; fromBlueprint: boolean; onChange: (value: string) => void }) {
  return <section><h1 className="text-3xl font-extrabold tracking-tight text-[#041B2D]">Choose one practice for this week</h1><p className="mt-3 leading-7 text-slate-600">Small enough to repeat. Specific enough to know when you did it.</p>{fromBlueprint && form.action_label ? <div className="mt-6 rounded-2xl border border-[#9DCFC3] bg-[#EAFBF8] p-4"><p className="text-xs font-bold uppercase tracking-[0.14em] text-[#087F72]">Selected from your Blueprint</p><p className="mt-2 font-semibold text-[#041B2D]">{form.action_label}</p></div> : null}<div className="mt-5 grid gap-3">{starterActions.map((action) => <button key={action} type="button" onClick={() => onChange(action)} aria-pressed={form.action_label === action} className={`flex items-center justify-between rounded-2xl border p-4 text-left font-semibold ${form.action_label === action ? "border-[#08A88A] bg-[#EAFBF8]" : "border-slate-200 hover:border-[#9DCFC3]"}`}><span>{action}</span>{form.action_label === action ? <Check className="h-5 w-5 text-[#087F72]" /> : null}</button>)}</div><label className="mt-5 block text-sm font-bold text-[#041B2D]" htmlFor="weekly-action">Or write your own lifestyle practice</label><textarea id="weekly-action" rows={3} maxLength={240} value={form.action_label} onChange={(event) => onChange(event.target.value)} placeholder="Take a 10-minute walk after lunch" className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-[#08A88A] focus:ring-2 focus:ring-[#08A88A]/20" /></section>;
}

function CueStep({ form, onChange }: { form: FormState; onChange: (changes: Partial<FormState>) => void }) {
  return <section><h1 className="text-3xl font-extrabold tracking-tight text-[#041B2D]">Give your practice a clear cue</h1><p className="mt-3 leading-7 text-slate-600">Connect it to something that already happens in your day.</p><label className="mt-6 block text-sm font-bold text-[#041B2D]" htmlFor="cue">After I...</label><input id="cue" maxLength={160} value={form.cue} onChange={(event) => onChange({ cue: event.target.value })} placeholder="put away my lunch" className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-[#08A88A] focus:ring-2 focus:ring-[#08A88A]/20" /><fieldset className="mt-6"><legend className="text-sm font-bold text-[#041B2D]">How many days this week?</legend><div className="mt-3 flex flex-wrap gap-2">{[1, 2, 3, 4, 5, 6, 7].map((frequency) => <button key={frequency} type="button" onClick={() => onChange({ frequency_per_week: frequency })} aria-pressed={form.frequency_per_week === frequency} className={`h-11 w-11 rounded-xl border font-bold ${form.frequency_per_week === frequency ? "border-[#08A88A] bg-[#08A88A] text-white" : "border-slate-200 text-slate-700 hover:border-[#9DCFC3]"}`}>{frequency}</button>)}</div></fieldset></section>;
}

function MinimumStep({ value, action, onChange }: { value: string; action: string; onChange: (value: string) => void }) {
  return <section><h1 className="text-3xl font-extrabold tracking-tight text-[#041B2D]">Make it work on a hard day</h1><p className="mt-3 leading-7 text-slate-600">Define the smallest version that still counts. You can always do more.</p><div className="mt-6 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600"><span className="font-bold text-[#041B2D]">Your practice:</span> {action}</div><label className="mt-5 block text-sm font-bold text-[#041B2D]" htmlFor="minimum-version">My minimum version is...</label><input id="minimum-version" maxLength={160} value={value} onChange={(event) => onChange(event.target.value)} placeholder="Walk for two minutes" className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-[#08A88A] focus:ring-2 focus:ring-[#08A88A]/20" /><div className="mt-4 flex flex-wrap gap-2">{["Do it for two minutes", "Complete one repetition", "Take the first small step"].map((minimum) => <button key={minimum} type="button" onClick={() => onChange(minimum)} className="rounded-full border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:border-[#9DCFC3] hover:bg-[#EAFBF8]">{minimum}</button>)}</div></section>;
}

function ReminderStep({ value, onChange }: { value: ReminderPreference; onChange: (value: ReminderPreference) => void }) {
  return <section><Mail className="h-8 w-8 text-[#08A88A]" /><h1 className="mt-4 text-3xl font-extrabold tracking-tight text-[#041B2D]">How should we support you?</h1><p className="mt-3 leading-7 text-slate-600">Choose your reminder preference. You can change this later.</p><div className="mt-6 grid gap-3">{[{ value: "email" as const, title: "Email support", copy: "Use email for weekly practice support when reminders launch." }, { value: "none" as const, title: "No reminders", copy: "I will use my own cue and dashboard." }].map((option) => <button key={option.value} type="button" onClick={() => onChange(option.value)} aria-pressed={value === option.value} className={`flex items-center justify-between rounded-2xl border p-5 text-left ${value === option.value ? "border-[#08A88A] bg-[#EAFBF8]" : "border-slate-200 hover:border-[#9DCFC3]"}`}><span><span className="block font-bold text-[#041B2D]">{option.title}</span><span className="mt-1 block text-sm text-slate-600">{option.copy}</span></span>{value === option.value ? <Check className="h-5 w-5 text-[#087F72]" /> : null}</button>)}</div></section>;
}

function ConfirmationStep({ form, active }: { form: FormState; active: boolean }) {
  return <section><CheckCircle2 className="h-10 w-10 text-[#08A88A]" /><h1 className="mt-4 text-3xl font-extrabold tracking-tight text-[#041B2D]">{active ? "Your week is active" : "Your first week is ready"}</h1><p className="mt-3 leading-7 text-slate-600">This is one vote for the person you are becoming. Keep it small, notice what works, and review after the week.</p><div className="mt-6 space-y-4 rounded-2xl border border-[#9DCFC3] bg-[#EAFBF8] p-5"><Summary label="Identity" value={identityLabel(form.identity_direction)} /><Summary label="This week I will" value={form.action_label} /><Summary label="My cue" value={`After I ${form.cue}`} /><Summary label="Target" value={`${form.frequency_per_week} ${form.frequency_per_week === 1 ? "day" : "days"} this week`} /><Summary label="On a hard day" value={form.minimum_version} /></div></section>;
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs font-bold uppercase tracking-[0.13em] text-[#087F72]">{label}</p><p className="mt-1 font-semibold leading-6 text-[#041B2D]">{value}</p></div>;
}

function formFromExperiment(experiment: WeeklyExperiment): FormState {
  return {
    identity_direction: experiment.identity_direction,
    action_label: experiment.action_label ?? "",
    cue: experiment.cue ?? "",
    frequency_per_week: experiment.frequency_per_week ?? 3,
    minimum_version: experiment.minimum_version ?? "",
    reminder_preference: experiment.reminder_preference ?? "none",
  };
}

function payloadForStep(step: number, form: FormState) {
  if (step === 1) return { step, identity_direction: form.identity_direction };
  if (step === 2) return { step, action_label: form.action_label };
  if (step === 3) return { step, cue: form.cue, frequency_per_week: form.frequency_per_week };
  if (step === 4) return { step, minimum_version: form.minimum_version };
  if (step === 5) return { step, reminder_preference: form.reminder_preference };
  return { step: 6 };
}

function errorMessage(code: string | undefined) {
  if (code === "choose_identity") return "Choose the identity you want to reinforce.";
  if (code === "choose_safe_lifestyle_action") return "Choose a lifestyle action. Supplement and medication changes stay in your Blueprint for professional review.";
  if (code === "add_cue_and_frequency") return "Add a clear cue and choose how many days you want to practice.";
  if (code === "add_safe_minimum_version") return "Add a small lifestyle version that can count on a hard day.";
  if (code === "complete_required_steps") return "One of the earlier steps is incomplete. Go back and review your plan.";
  return "We could not save that step. Please try again.";
}
