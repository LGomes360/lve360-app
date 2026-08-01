"use client";

import { Check, Circle, Link2, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { PremiumActivationProgress } from "@/lib/premiumActivation";

export default function PremiumActivationChecklist({
  progress,
  surface,
}: {
  progress: PremiumActivationProgress;
  surface: "today" | "blueprints";
}) {
  const router = useRouter();
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (progress.firstActionComplete) return null;

  const blueprintComplete = progress.blueprint.status === "connected";
  const practiceComplete = progress.practice.status === "active";
  const completed = Number(blueprintComplete) + Number(practiceComplete);
  const currentStep = !blueprintComplete ? 1 : !practiceComplete ? 2 : 3;

  async function connectBlueprint() {
    setConnecting(true);
    setError(null);
    try {
      const response = await fetch("/api/provision-user", { method: "POST" });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.ok) {
        throw new Error("We could not connect that Blueprint. Please try again.");
      }
      router.refresh();
    } catch (connectError) {
      setError(connectError instanceof Error ? connectError.message : "We could not connect that Blueprint.");
    } finally {
      setConnecting(false);
    }
  }

  return (
    <section className="rounded-3xl border border-[#9DCFC3] bg-white p-6 shadow-sm sm:p-8" aria-labelledby={`${surface}-activation-title`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#087F72]">Start here</p>
          <h1 id={`${surface}-activation-title`} className="mt-2 text-3xl font-bold tracking-tight text-[#041B2D]">
            Get LVE360 working for you
          </h1>
          <p className="mt-3 max-w-2xl leading-7 text-slate-600">
            Follow one recommended sequence. You do not need to set up everything at once.
          </p>
        </div>
        <div className="shrink-0 rounded-full bg-[#EAFBF8] px-4 py-2 text-sm font-bold text-[#087F72]">
          {completed} of 3 complete
        </div>
      </div>

      <ol className="mt-7 space-y-3">
        <ActivationStep
          number={1}
          title="Connect your Blueprint"
          description={blueprintDescription(progress)}
          complete={blueprintComplete}
          current={currentStep === 1}
        >
          {progress.blueprint.status === "recoverable" ? (
            <button
              type="button"
              onClick={connectBlueprint}
              disabled={connecting}
              className="inline-flex min-h-11 items-center rounded-xl bg-[#087F72] px-4 py-2 font-bold text-white hover:bg-[#06695F] disabled:opacity-60"
            >
              {connecting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Link2 className="mr-2 h-4 w-4" />}
              Connect this Blueprint
            </button>
          ) : progress.blueprint.status === "missing" ? (
            <Link href="/quiz" className="inline-flex min-h-11 items-center rounded-xl bg-[#087F72] px-4 py-2 font-bold text-white hover:bg-[#06695F]">
              Complete my health intake
            </Link>
          ) : progress.blueprint.stackId ? (
            <Link href={`/blueprints/${encodeURIComponent(progress.blueprint.stackId)}`} className="text-sm font-bold text-[#087F72] hover:underline">
              Open Blueprint
            </Link>
          ) : null}
        </ActivationStep>

        <ActivationStep
          number={2}
          title="Choose one weekly practice"
          description={practiceComplete
            ? "Your focused practice is ready for this week."
            : progress.practice.status === "draft"
              ? "Finish the practice you started and make the smallest version clear."
              : "Choose one lifestyle action that supports the person you want to become."}
          complete={practiceComplete}
          current={currentStep === 2}
        >
          {!practiceComplete && blueprintComplete ? (
            <Link href="/onboarding" className="inline-flex min-h-11 items-center rounded-xl bg-[#087F72] px-4 py-2 font-bold text-white hover:bg-[#06695F]">
              {progress.practice.status === "draft" ? "Finish practice setup" : "Choose my weekly practice"}
            </Link>
          ) : null}
        </ActivationStep>

        <ActivationStep
          number={3}
          title="Complete your first useful action"
          description={practiceComplete
            ? "Do the full practice or its minimum version, then record the repetition."
            : "This unlocks after your weekly practice is ready."}
          complete={false}
          current={currentStep === 3}
        >
          {practiceComplete ? (
            <Link href={surface === "today" ? "#focused-practice" : "/today#focused-practice"} className="inline-flex min-h-11 items-center rounded-xl bg-[#087F72] px-4 py-2 font-bold text-white hover:bg-[#06695F]">
              Open today&apos;s action
            </Link>
          ) : null}
        </ActivationStep>
      </ol>

      {error ? <p className="mt-4 text-sm font-semibold text-rose-700" role="alert">{error}</p> : null}

      <div className="mt-6 rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">
        <strong className="text-[#041B2D]">Optional while you get started:</strong> Daily check-ins,
        Routine organization, and email reminders can wait. They support your system but do not block activation.
      </div>
    </section>
  );
}

function ActivationStep({
  number,
  title,
  description,
  complete,
  current,
  children,
}: {
  number: number;
  title: string;
  description: string;
  complete: boolean;
  current: boolean;
  children?: React.ReactNode;
}) {
  return (
    <li className={`rounded-2xl border p-5 ${current ? "border-[#08A88A] bg-[#F4FAF8]" : "border-slate-200 bg-white"}`}>
      <div className="flex items-start gap-4">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-bold ${complete ? "bg-[#08A88A] text-white" : current ? "border-2 border-[#08A88A] bg-white text-[#087F72]" : "bg-slate-100 text-slate-500"}`}>
          {complete ? <Check className="h-5 w-5" aria-label="Complete" /> : current ? number : <Circle className="h-4 w-4" aria-hidden="true" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold text-[#041B2D]">{title}</h2>
            {current ? <span className="rounded-full bg-[#DDF7F1] px-2.5 py-1 text-xs font-bold text-[#087F72]">Recommended next</span> : null}
            {complete ? <span className="text-xs font-bold text-[#087F72]">Complete</span> : null}
          </div>
          <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
          {children ? <div className="mt-4">{children}</div> : null}
        </div>
      </div>
    </li>
  );
}

function blueprintDescription(progress: PremiumActivationProgress): string {
  if (progress.blueprint.status === "connected") return "Your latest Blueprint is connected to this membership.";
  if (progress.blueprint.status === "recoverable") {
    return "We found an existing Blueprint for your verified sign-in email. Connect it deliberately to continue.";
  }
  return "Complete the health intake so LVE360 can organize your goals, routine, and safety context.";
}
