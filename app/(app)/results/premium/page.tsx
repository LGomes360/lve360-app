"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertCircle, ArrowRight, CheckCircle2, FileText, Loader2, RefreshCw } from "lucide-react";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";

import { trackProductEvent } from "@/lib/productAnalyticsClient";

type HandoffState =
  | { name: "loading" }
  | { name: "no_submission" }
  | { name: "generating"; submissionId: string }
  | { name: "ready"; stackId: string }
  | { name: "error"; message: string; submissionId?: string };

const POLL_INTERVAL_MS = 4_000;
const GENERATION_WAIT_MS = 240_000;

function PremiumResultsHandoff() {
  const searchParams = useSearchParams();
  const requestedSubmissionId = searchParams.get("submission_id");
  const [state, setState] = useState<HandoffState>({ name: "loading" });
  const [pollAttempt, setPollAttempt] = useState(0);
  const startedAtRef = useRef(Date.now());

  const checkStatus = useCallback(async () => {
    const query = requestedSubmissionId
      ? `?submission_id=${encodeURIComponent(requestedSubmissionId)}`
      : "";
    const response = await fetch(`/api/blueprint-handoff${query}`, { cache: "no-store" });
    const json = await response.json().catch(() => null);
    if (!response.ok || !json?.ok) throw new Error("We could not check your Blueprint status.");

    if (json.status === "no_submission") {
      setState({ name: "no_submission" });
      return "done";
    }
    if (json.status === "ready" && json.stack?.id) {
      setState({ name: "ready", stackId: json.stack.id });
      trackProductEvent({ event_name: "blueprint_handoff_ready", source: "results" });
      return "done";
    }

    const submissionId = String(json.submission?.id ?? requestedSubmissionId ?? "");
    setState({ name: "generating", submissionId });
    return "pending";
  }, [requestedSubmissionId]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    startedAtRef.current = Date.now();

    async function poll() {
      try {
        const result = await checkStatus();
        if (cancelled || result === "done") return;
        if (Date.now() - startedAtRef.current >= GENERATION_WAIT_MS) {
          setState((current) => ({
            name: "error",
            message: "Your Blueprint is taking longer than expected. You can safely retry generation.",
            submissionId: current.name === "generating" ? current.submissionId : undefined,
          }));
          return;
        }
        timer = setTimeout(poll, POLL_INTERVAL_MS);
      } catch (error) {
        if (!cancelled) {
          setState({
            name: "error",
            message: error instanceof Error ? error.message : "Blueprint status is temporarily unavailable.",
            submissionId: requestedSubmissionId ?? undefined,
          });
        }
      }
    }

    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [checkStatus, pollAttempt, requestedSubmissionId]);

  async function retryGeneration(submissionId: string | undefined) {
    if (!submissionId) {
      startedAtRef.current = Date.now();
      setState({ name: "loading" });
      setPollAttempt((attempt) => attempt + 1);
      return;
    }

    setState({ name: "generating", submissionId });
    trackProductEvent({ event_name: "blueprint_handoff_retry", source: "results" });
    try {
      const response = await fetch("/api/generate-stack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submission_id: submissionId,
          generation_source: "premium-handoff-retry",
        }),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.ok) {
        throw new Error(json?.error || "Blueprint generation did not complete.");
      }
      const stackId = json?.stack?.raw?.stack_id ?? json?.ai?.raw?.stack_id;
      if (stackId) {
        setState({ name: "ready", stackId: String(stackId) });
      } else {
        startedAtRef.current = Date.now();
        setPollAttempt((attempt) => attempt + 1);
      }
    } catch (error) {
      setState({
        name: "error",
        message: error instanceof Error ? error.message : "Blueprint generation did not complete.",
        submissionId,
      });
    }
  }

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-3xl items-center justify-center py-8">
      <section className="w-full rounded-3xl border border-[#CDE9E3] bg-white p-6 shadow-xl sm:p-10">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#087F72]">Your LVE360 Blueprint</p>
        {state.name === "loading" ? <LoadingState /> : null}
        {state.name === "generating" ? <GeneratingState /> : null}
        {state.name === "ready" ? <ReadyState stackId={state.stackId} /> : null}
        {state.name === "no_submission" ? <NoSubmissionState /> : null}
        {state.name === "error" ? (
          <ErrorState
            message={state.message}
            onRetry={() => void retryGeneration(state.submissionId)}
          />
        ) : null}
      </section>
    </div>
  );
}

function LoadingState() {
  return <div className="py-12 text-center" role="status" aria-live="polite"><Loader2 className="mx-auto h-9 w-9 animate-spin text-[#08A88A]" /><h1 className="mt-5 text-3xl font-extrabold text-[#041B2D]">Connecting your intake</h1><p className="mx-auto mt-3 max-w-xl leading-7 text-slate-600">We are locating your latest answers and checking your Blueprint status.</p></div>;
}

function GeneratingState() {
  return <div className="py-10 text-center" role="status" aria-live="polite"><div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#EAFBF8]"><Loader2 className="h-8 w-8 animate-spin text-[#08A88A]" /></div><h1 className="mt-6 text-3xl font-extrabold text-[#041B2D]">Your Blueprint is being prepared</h1><p className="mx-auto mt-3 max-w-xl leading-7 text-slate-600">We are reviewing your goals, routines, supplements, medications, and safety context. This can take a few minutes. You can leave this page and return to Blueprints at any time.</p><div className="mx-auto mt-7 h-2 max-w-md overflow-hidden rounded-full bg-slate-100"><div className="h-full w-2/3 animate-pulse rounded-full bg-[#08A88A]" /></div><Link href="/blueprints" className="mt-7 inline-flex min-h-11 items-center justify-center rounded-xl border border-[#9DCFC3] px-5 py-3 font-bold text-[#087F72] hover:bg-[#EAFBF8]">Go to Blueprints</Link></div>;
}

function ReadyState({ stackId }: { stackId: string }) {
  return <div className="py-10 text-center"><CheckCircle2 className="mx-auto h-12 w-12 text-[#08A88A]" /><h1 className="mt-5 text-3xl font-extrabold text-[#041B2D]">Your Blueprint is ready</h1><p className="mx-auto mt-3 max-w-xl leading-7 text-slate-600">Open your interactive workspace to review your priorities, safety notes, lifestyle actions, and current routine.</p><div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row"><Link href={`/blueprints/${encodeURIComponent(stackId)}`} className="inline-flex min-h-12 items-center justify-center rounded-xl bg-[#087F72] px-6 py-3 font-bold text-white hover:bg-[#06695F]"><FileText className="mr-2 h-5 w-5" />Open my Blueprint <ArrowRight className="ml-2 h-5 w-5" /></Link><Link href="/today" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-300 px-6 py-3 font-bold text-[#041B2D] hover:bg-slate-50">Go to Today</Link></div></div>;
}

function NoSubmissionState() {
  return <div className="py-10 text-center"><FileText className="mx-auto h-11 w-11 text-[#087F72]" /><h1 className="mt-5 text-3xl font-extrabold text-[#041B2D]">Complete your health intake</h1><p className="mx-auto mt-3 max-w-xl leading-7 text-slate-600">Your intake gives LVE360 the context needed to create your first Blueprint.</p><Link href="/quiz" className="mt-7 inline-flex min-h-12 items-center justify-center rounded-xl bg-[#087F72] px-6 py-3 font-bold text-white hover:bg-[#06695F]">Complete my intake <ArrowRight className="ml-2 h-5 w-5" /></Link></div>;
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div className="py-10 text-center" role="alert"><AlertCircle className="mx-auto h-11 w-11 text-amber-600" /><h1 className="mt-5 text-3xl font-extrabold text-[#041B2D]">Your Blueprint needs another try</h1><p className="mx-auto mt-3 max-w-xl leading-7 text-slate-600">{message}</p><div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row"><button type="button" onClick={onRetry} className="inline-flex min-h-12 items-center justify-center rounded-xl bg-[#087F72] px-6 py-3 font-bold text-white hover:bg-[#06695F]"><RefreshCw className="mr-2 h-5 w-5" />Retry generation</button><Link href="/blueprints" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-300 px-6 py-3 font-bold text-[#041B2D] hover:bg-slate-50">Go to Blueprints</Link></div><p className="mt-6 text-sm text-slate-500">Retrying does not change your intake answers.</p></div>;
}

export default function PremiumResultsPage() {
  return <Suspense fallback={<LoadingState />}><PremiumResultsHandoff /></Suspense>;
}
