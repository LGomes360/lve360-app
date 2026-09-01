"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  FileDown,
  HeartPulse,
  History,
  ListChecks,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  X,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import type { BlueprintDelta } from "@/lib/blueprintDelta";
import type { MemberSupplement } from "@/lib/blueprintWorkspace";
import { doseIntegrityIssue } from "@/lib/doseIntegrity";
import { trackProductEvent } from "@/lib/productAnalyticsClient";
import { reportSectionTitle } from "@/lib/reportPresentation";
import type {
  MemberRecommendationDecision,
  RecommendationDecisionRecord,
} from "@/lib/recommendationDecision";

import BlueprintDeltaPanel from "./BlueprintDeltaPanel";

type StackSummary = {
  id: string;
  submissionId: string;
  createdAt: string | null;
  safetyStatus: "safe" | "warning" | "error" | null;
  generationReason: string | null;
  safetyAcknowledgedAt: string | null;
};

type VersionSummary = {
  id: string;
  createdAt: string | null;
  safetyStatus: string | null;
  generationReason: string | null;
};

type RecommendationSummary = {
  proposal: {
    id: string;
    name: string;
    dose: string | null;
    timing: string | null;
    timing_text: string | null;
    link_amazon: string | null;
    link_fullscript: string | null;
  };
  decision: RecommendationDecisionRecord;
};

type Props = {
  stack: StackSummary;
  sections: Array<{ name: string; body: string }>;
  recommendations: RecommendationSummary[];
  initialSupplements: MemberSupplement[];
  hasMemberOverride: boolean;
  initialStale: boolean;
  versioningReady: boolean;
  isLatest: boolean;
  history: VersionSummary[];
  delta: BlueprintDelta | null;
};

export default function BlueprintWorkspaceClient({
  stack,
  sections,
  recommendations,
  initialSupplements,
  hasMemberOverride,
  initialStale,
  versioningReady,
  isLatest,
  history,
  delta,
}: Props) {
  const router = useRouter();
  const [supplements, setSupplements] = useState(initialSupplements);
  const [draft, setDraft] = useState(initialSupplements);
  const [editing, setEditing] = useState(false);
  const [stale, setStale] = useState(initialStale);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshIssue, setRefreshIssue] = useState<string | null>(null);
  const [safetyAcknowledged, setSafetyAcknowledged] = useState(Boolean(stack.safetyAcknowledgedAt));
  const [acknowledgingSafety, setAcknowledgingSafety] = useState(false);
  const [unacknowledgingSafety, setUnacknowledgingSafety] = useState(false);
  const [recommendationItems, setRecommendationItems] = useState(recommendations);
  const [recommendationBusyId, setRecommendationBusyId] = useState<string | null>(null);

  useEffect(() => {
    trackProductEvent({ event_name: "blueprint_viewed", source: "blueprints" });
  }, []);

  useEffect(() => {
    setRecommendationItems(recommendations);
  }, [recommendations]);

  useEffect(() => {
    if (recommendationItems.length > 0) {
      trackProductEvent({ event_name: "recommendation_viewed", source: "blueprints" });
    }
  }, [recommendationItems.length]);

  function beginEditing() {
    if (!versioningReady) {
      setError("Blueprint updates are temporarily unavailable while versioning is being enabled.");
      return;
    }
    if (editing) return;
    setDraft(supplements.map((item) => ({ ...item })));
    setEditing(true);
    setMessage(null);
    setError(null);
    trackProductEvent({ event_name: "blueprint_input_change_started", source: "blueprints" });
    window.setTimeout(() => {
      document.getElementById("current-supplements")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  }

  function cancelEditing() {
    setDraft(supplements.map((item) => ({ ...item })));
    setEditing(false);
    setError(null);
  }

  function updateDraft(id: string, patch: Partial<MemberSupplement>) {
    setDraft((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  }

  function addDraft() {
    setDraft((current) => [
      ...current,
      {
        id: `draft:${crypto.randomUUID()}`,
        name: "",
        brand: null,
        dose: null,
        timing: null,
        active: true,
      },
    ]);
  }

  async function saveSupplements() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/blueprints/${encodeURIComponent(stack.id)}/supplements`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supplements: draft }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) {
        throw new Error(messageForSupplementError(data?.error));
      }
      setSupplements(data.supplements);
      setDraft(data.supplements);
      setStale(Boolean(data.stale));
      setEditing(false);
      setMessage("Your current supplement information was updated in Plan and Routine. Older Blueprints remain unchanged. Refresh when you want a new dated report.");
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "We could not save those changes.");
    } finally {
      setSaving(false);
    }
  }

  async function refreshBlueprint() {
    setRefreshing(true);
    setError(null);
    setMessage(null);
    setRefreshIssue(null);
    try {
      const response = await fetch(`/api/blueprints/${encodeURIComponent(stack.id)}/refresh`, {
        method: "POST",
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok || !data?.stack_id) {
        throw new Error(data?.error ?? "refresh_unavailable");
      }
      window.location.assign(`/blueprints/${encodeURIComponent(data.stack_id)}?refreshed=1`);
    } catch (refreshError) {
      const validationFailed = refreshError instanceof Error && refreshError.message === "blueprint_refresh_validation_failed";
      setRefreshIssue(
        validationFailed
          ? "We protected your saved health information because the updated report did not match it exactly. Your current Blueprint is unchanged. This is an internal report issue, not something you need to correct."
          : "We could not create an updated version right now. Your saved changes and current Blueprint are still available. This is a service issue, so there is nothing you need to correct. Please try again in a few minutes."
      );
      setRefreshing(false);
    }
  }

  async function acknowledgeSafetyNotes() {
    setAcknowledgingSafety(true);
    setError(null);
    try {
      const response = await fetch(`/api/blueprints/${encodeURIComponent(stack.id)}/safety-acknowledgement`, {
        method: "POST",
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) throw new Error("safety_acknowledgement_unavailable");
      setSafetyAcknowledged(true);
      setMessage("Safety notes marked as reviewed. LVE360 will alert you again when a new Blueprint needs review.");
      router.refresh();
    } catch {
      setError("We could not save that acknowledgement. Please try again.");
    } finally {
      setAcknowledgingSafety(false);
    }
  }

  async function markSafetyNotesForReview() {
    setUnacknowledgingSafety(true);
    setError(null);
    try {
      const response = await fetch(`/api/blueprints/${encodeURIComponent(stack.id)}/safety-acknowledgement`, {
        method: "DELETE",
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) throw new Error("safety_acknowledgement_unavailable");
      setSafetyAcknowledged(false);
      setMessage("Safety notes marked for review again.");
      router.refresh();
    } catch {
      setError("We could not update that review status. Please try again.");
    } finally {
      setUnacknowledgingSafety(false);
    }
  }

  async function updateRecommendationStatus(itemId: string, decision: MemberRecommendationDecision) {
    setRecommendationBusyId(itemId);
    setError(null);
    try {
      const response = await fetch("/api/recommendations/decision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: itemId, decision }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok || !data?.decision) throw new Error(data?.error ?? "recommendation_decision_failed");
      setRecommendationItems((current) => current.map((item) =>
        item.proposal.id === itemId ? { ...item, decision: data.decision } : item
      ));
      const statusMessage = decision === "clinician_review"
        ? "Marked for a clinician or healthcare provider conversation."
        : decision === "deferred"
          ? "Moved out of your active ideas for now."
          : decision === "dismissed"
            ? "Dismissed for this health context."
            : "Returned to active review.";
      setMessage(statusMessage);
      router.refresh();
    } catch {
      setError("We could not save that recommendation decision. Nothing changed.");
    } finally {
      setRecommendationBusyId(null);
    }
  }

  async function adoptRecommendation(item: RecommendationSummary) {
    if (item.decision.overlap_snapshot.length || item.decision.status === "clinician_review") {
      const confirmed = window.confirm(
        "This recommendation has an overlap or clinician-review note. Only add it after you have checked that it belongs in your routine."
      );
      if (!confirmed) return;
    }
    setRecommendationBusyId(item.proposal.id);
    setError(null);
    try {
      const response = await fetch("/api/stack-items/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: item.proposal.id }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) throw new Error("recommendation_adoption_failed");
      setRecommendationItems((current) => current.map((candidate) =>
        candidate.proposal.id === item.proposal.id
          ? { ...candidate, decision: { ...candidate.decision, status: "adopted" } }
          : candidate
      ));
      setMessage(`${item.proposal.name} was added to your current routine. Record its schedule in Routine.`);
      router.refresh();
    } catch {
      setError("We could not add that recommendation. Your routine is unchanged.");
    } finally {
      setRecommendationBusyId(null);
    }
  }

  const activeCount = supplements.filter((item) => item.active).length;
  const openRecommendationCount = recommendationItems.filter((item) =>
    item.decision.status === "review" || item.decision.status === "clinician_review"
  ).length;
  const hasSafetyNotes = stack.safetyStatus !== "safe";
  const recommendationTarget = recommendationItems.length ? "#recommendation-decisions" : "#recommendation-report";

  return (
    <div className="mx-auto max-w-6xl pb-16">
      <Link href="/blueprints" className="inline-flex items-center text-sm font-semibold text-[#087F72] hover:underline">
        <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
        All Blueprints
      </Link>

      <header className="mt-5 rounded-3xl border border-[#BCE3DA] bg-gradient-to-br from-white to-[#EFFBF8] p-6 shadow-sm sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#087F72]">
              {isLatest ? "Latest saved Blueprint" : "Archived Blueprint"}
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-[#041B2D] sm:text-4xl">
              Your health Blueprint
            </h1>
            <p className="mt-3 text-slate-600">
              Generated {formatDate(stack.createdAt)}. This is a dated snapshot of the information available at that time.
            </p>
          </div>
          <div className="flex flex-col items-start gap-3 sm:flex-row lg:flex-col lg:items-end">
            <SafetyBadge status={stack.safetyStatus} stale={stale} acknowledged={safetyAcknowledged} />
            <a
              href={`/api/export-pdf?stack_id=${encodeURIComponent(stack.id)}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackProductEvent({ event_name: "blueprint_pdf_opened", source: "blueprints" })}
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-[#041B2D] hover:bg-slate-50"
            >
              <FileDown className="mr-2 h-4 w-4" aria-hidden="true" />
              Open PDF
            </a>
          </div>
        </div>
      </header>

      <section className="mt-6 rounded-2xl border border-[#9DCFC3] bg-[#EAFBF8] p-5 shadow-sm sm:p-6" aria-labelledby="blueprint-plan-handoff-title">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#087F72]">Blueprint and Plan</p>
            <h2 id="blueprint-plan-handoff-title" className="mt-1 text-2xl font-bold text-[#041B2D]">This report is a snapshot. Plan stays current.</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Use this Blueprint for its baseline reasoning, safety notes, PDF, and history. Use Plan for your current focus and confirmed changes, and Routine for current medications, hormones, supplements, doses, and timing.
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-3 sm:flex-row">
            <Link href="/plan" className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#087F72] px-5 py-3 text-sm font-bold text-white hover:bg-[#06695F]">
              <ListChecks className="mr-2 h-4 w-4" aria-hidden="true" /> Open current Plan
            </Link>
            <Link href="/routine" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[#9DCFC3] bg-white px-5 py-3 text-sm font-bold text-[#06695F] hover:bg-[#F4FAF8]">
              Edit current Routine
            </Link>
          </div>
        </div>
      </section>

      {!isLatest ? (
        <div className="mt-6 rounded-2xl border border-blue-200 bg-blue-50 p-5 text-sm leading-6 text-blue-950">
          You are viewing an earlier version. It remains available for reference, but edits apply to your current health context.
          <Link href={`/blueprints/${history[0]?.id ?? stack.id}`} className="ml-2 font-bold underline">
            Open the latest version
          </Link>
        </div>
      ) : null}

      {stale ? (
        <section className="mt-6 rounded-2xl border border-amber-300 bg-amber-50 p-5 shadow-sm">
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" />
            <div className="flex-1">
              <h2 className="font-bold text-amber-950">
                {refreshIssue ? "Your saved Blueprint is still available" : "Your Plan has changed since this Blueprint"}
              </h2>
              <p className="mt-1 text-sm leading-6 text-amber-900">
                {refreshIssue ?? "Your living Plan now differs from this dated report. Create a new Blueprint version when you are ready to review those changes and rerun the safety check."}
              </p>
              <button
                type="button"
                onClick={refreshBlueprint}
                disabled={refreshing || editing}
                className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-amber-800 px-5 py-3 text-sm font-bold text-white hover:bg-amber-900 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {refreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />}
                {refreshing ? "Building your updated Blueprint (usually under a minute)..." : refreshIssue ? "Try Blueprint refresh again" : "Refresh Blueprint and safety review"}
              </button>
            </div>
          </div>
        </section>
      ) : (
        <section className="mt-6 flex gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm leading-6 text-emerald-950">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" aria-hidden="true" />
          <p>This dated Blueprint matches your currently saved inputs. Plan remains the place to review what is current; return here when you need the report, PDF, or history.</p>
        </section>
      )}

      {message ? <p role="status" className="mt-5 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900">{message}</p> : null}
      {error ? <p role="alert" className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-800">{error}</p> : null}

      {delta ? <BlueprintDeltaPanel delta={delta} stale={stale} /> : null}

      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="blueprint-next-steps-title">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#087F72]">Report review</p>
        <h2 id="blueprint-next-steps-title" className="mt-1 text-2xl font-bold text-[#041B2D]">What this Blueprint asks you to review</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Review the report&apos;s ideas and safety notes here. Use Plan and Routine for information that changes over time.
        </p>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <a
            href={recommendationTarget}
            onClick={() => {
              if (recommendationItems.length > 0) {
                trackProductEvent({ event_name: "recommendation_reason_opened", source: "blueprints" });
              }
            }}
            className="rounded-xl border border-slate-200 p-4 transition hover:border-[#9DCFC3] hover:bg-[#F4FAF8]"
          >
            <span className="flex items-center gap-2 font-bold text-[#041B2D]"><ClipboardCheck className="h-5 w-5 text-[#087F72]" aria-hidden="true" />Ideas to decide</span>
            <span className="mt-2 block text-sm leading-6 text-slate-600">{openRecommendationCount} {openRecommendationCount === 1 ? "idea needs" : "ideas need"} a keep, discuss, defer, or dismiss decision.</span>
          </a>
          <a href="#safety-notes" className="rounded-xl border border-slate-200 p-4 transition hover:border-amber-300 hover:bg-amber-50">
            <span className="flex items-center gap-2 font-bold text-[#041B2D]"><AlertTriangle className="h-5 w-5 text-amber-700" aria-hidden="true" />Safety review</span>
            <span className="mt-2 block text-sm leading-6 text-slate-600">{!hasSafetyNotes ? "No material concern identified." : safetyAcknowledged ? "Reviewed for this Blueprint." : "Open the safety notes and acknowledge them after review."}</span>
          </a>
          <Link href="/routine" className="rounded-xl border border-slate-200 p-4 transition hover:border-[#9DCFC3] hover:bg-[#F4FAF8]">
            <span className="flex items-center gap-2 font-bold text-[#041B2D]"><CheckCircle2 className="h-5 w-5 text-[#087F72]" aria-hidden="true" />Put it into practice</span>
            <span className="mt-2 block text-sm leading-6 text-slate-600">Open Routine to schedule and check off supplements, medications, and hormones.</span>
          </Link>
        </div>
      </section>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <main className="min-w-0 space-y-6">
          <section id="current-supplements" className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#087F72]">Report correction</p>
                <h2 className="mt-1 text-2xl font-bold text-[#041B2D]">Correct the supplement information behind this report</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {activeCount} active {activeCount === 1 ? "supplement" : "supplements"}.
                  {hasMemberOverride ? " You have reviewed this list in LVE360." : " This list came from your original intake."} Corrections update your living Plan and Routine while preserving every older Blueprint.
                </p>
                {!versioningReady ? (
                  <p className="mt-2 text-sm font-semibold text-amber-800">
                    Interactive updates will become available after Blueprint versioning is enabled.
                  </p>
                ) : null}
              </div>
              {!editing ? (
                <button
                  type="button"
                  onClick={beginEditing}
                  disabled={!versioningReady}
                  className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[#087F72] px-4 py-2 text-sm font-bold text-[#087F72] hover:bg-[#EFFBF8] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Pencil className="mr-2 h-4 w-4" aria-hidden="true" />
                  Correct supplement information
                </button>
              ) : null}
            </div>

            {editing ? (
              <SupplementEditor
                supplements={draft}
                saving={saving}
                onChange={updateDraft}
                onAdd={addDraft}
                onCancel={cancelEditing}
                onSave={saveSupplements}
              />
            ) : (
              <SupplementList supplements={supplements} />
            )}
          </section>

          <RecommendationDecisionPanel
            items={recommendationItems}
            busyId={recommendationBusyId}
            onDecision={updateRecommendationStatus}
            onAdopt={adoptRecommendation}
          />

          <div className="pt-2">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Supporting report</p>
            <h2 className="mt-1 text-2xl font-bold text-[#041B2D]">Why your Blueprint says this</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">These sections preserve the complete report in a readable reference format.</p>
          </div>

          {sections.filter((section) => section.name !== "This Week Try").map((section, index) => (
            <ReportSection
              key={section.name}
              sectionNumber={index + 1}
              name={section.name}
              body={section.body}
              stale={stale}
              onEditSupplements={beginEditing}
              onRefresh={refreshBlueprint}
              refreshing={refreshing}
              safetyAcknowledged={safetyAcknowledged}
              acknowledgingSafety={acknowledgingSafety}
              unacknowledgingSafety={unacknowledgingSafety}
              onAcknowledgeSafety={acknowledgeSafetyNotes}
              onMarkSafetyForReview={markSafetyNotesForReview}
              safetyNeedsReview={stack.safetyStatus !== "safe"}
            />
          ))}
        </main>

        <aside className="space-y-6">
          <section id="version-history" className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <History className="h-5 w-5 text-[#087F72]" aria-hidden="true" />
              <h2 className="font-bold text-[#041B2D]">Version history</h2>
            </div>
            <ul className="mt-3 divide-y divide-slate-100">
              {history.slice(0, 6).map((version, index) => (
                <li key={version.id} className="py-3">
                  {version.id === stack.id ? (
                    <div>
                      <p className="text-sm font-bold text-[#041B2D]">{formatDate(version.createdAt)}</p>
                      <p className="mt-1 text-xs text-slate-500">{index === 0 ? "Latest version" : "Viewing this version"}</p>
                    </div>
                  ) : (
                    <Link
                      href={`/blueprints/${version.id}`}
                      onClick={() => trackProductEvent({ event_name: "blueprint_version_selected", source: "blueprints" })}
                      className="block rounded-lg py-1 text-sm font-semibold text-[#087F72] hover:underline"
                    >
                      {formatDate(version.createdAt)}
                      <span className="mt-1 block text-xs font-normal text-slate-500">
                        {version.generationReason === "member-refresh" ? "Member refresh" : "Original Blueprint"}
                      </span>
                    </Link>
                  )}
                </li>
              ))}
            </ul>
            {history.length > 6 ? (
              <Link href="/blueprints" className="mt-3 inline-flex text-sm font-bold text-[#087F72] hover:underline">
                View all {history.length} versions
              </Link>
            ) : null}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 text-sm leading-6 text-slate-600 shadow-sm">
            <h2 className="font-bold text-[#041B2D]">When to create a new version</h2>
            <p className="mt-2">
              Keep medications, hormones, supplements, doses, and timing accurate in Routine. Refresh this Blueprint after a relevant change when you want a new dated report and safety review.
            </p>
            <div className="mt-3 flex flex-col items-start gap-2">
              <Link href="/routine" className="inline-flex font-bold text-[#087F72] hover:underline">
                Edit current Routine
              </Link>
              <Link href="/quiz" className="inline-flex font-bold text-[#087F72] hover:underline">
                Update broader health context
              </Link>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function RecommendationDecisionPanel({
  items,
  busyId,
  onDecision,
  onAdopt,
}: {
  items: RecommendationSummary[];
  busyId: string | null;
  onDecision: (itemId: string, decision: MemberRecommendationDecision) => void;
  onAdopt: (item: RecommendationSummary) => void;
}) {
  if (!items.length) return null;
  const ordered = [...items].sort((left, right) => {
    const statusOrder: Record<RecommendationDecisionRecord["status"], number> = {
      review: 0,
      clinician_review: 1,
      deferred: 2,
      dismissed: 3,
      adopted: 4,
    };
    return statusOrder[left.decision.status] - statusOrder[right.decision.status]
      || left.proposal.name.localeCompare(right.proposal.name);
  });
  const activeCount = ordered.filter((item) => item.decision.status === "review" || item.decision.status === "clinician_review").length;

  return (
    <section id="recommendation-decisions" className="scroll-mt-24 rounded-2xl border border-[#9DCFC3] bg-[#F4FAF8] p-5 shadow-sm sm:p-6" aria-labelledby="recommendation-decisions-title">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#087F72]">Live decision layer</p>
      <h2 id="recommendation-decisions-title" className="mt-1 text-2xl font-bold text-[#041B2D]">Understand each idea before you act</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700">
        This dated Blueprint stays unchanged. Your decisions below remain live across Blueprint, Today, and Routine. {activeCount} {activeCount === 1 ? "idea needs" : "ideas need"} a decision.
      </p>
      <ul className="mt-5 space-y-4">
        {ordered.map((item) => {
          const busy = busyId === item.proposal.id;
          const active = item.decision.status === "review" || item.decision.status === "clinician_review";
          const link = item.proposal.link_fullscript || item.proposal.link_amazon;
          return (
            <li key={item.proposal.id} className={`rounded-2xl border p-4 sm:p-5 ${active ? "border-[#BCE3DA] bg-white" : "border-slate-200 bg-slate-50"}`}>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="text-lg font-bold text-[#041B2D]">{item.proposal.name}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-700">{item.decision.reason_snapshot}</p>
                </div>
                <span className={`w-fit shrink-0 rounded-full px-3 py-1 text-xs font-bold ${active ? "bg-amber-100 text-amber-900" : item.decision.status === "adopted" ? "bg-emerald-100 text-emerald-900" : "bg-slate-200 text-slate-700"}`}>
                  {recommendationStatusLabel(item.decision.status)}
                </span>
              </div>
              {item.decision.overlap_snapshot.length ? (
                <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-950">
                  <strong>Possible overlap:</strong> Your current routine includes {item.decision.overlap_snapshot.join(", ")}. Check the ingredient labels before adding another source.
                </p>
              ) : null}
              {[item.proposal.dose, item.proposal.timing_text || item.proposal.timing].some(Boolean) ? (
                <p className="mt-3 text-sm text-slate-600">
                  <strong>Report starting guidance:</strong> {[item.proposal.dose, item.proposal.timing_text || item.proposal.timing].filter(Boolean).join(" · ")}
                </p>
              ) : null}
              {active ? (
                <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <button type="button" disabled={busy} onClick={() => void onAdopt(item)} className="inline-flex min-h-12 items-center justify-center rounded-xl bg-[#087F72] px-4 py-3 text-sm font-bold text-white hover:bg-[#06695F] disabled:opacity-60">
                    {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="mr-2 h-4 w-4" aria-hidden="true" />}
                    {item.decision.status === "clinician_review" ? "Add after review" : "Add to Routine"}
                  </button>
                  <button type="button" disabled={busy} onClick={() => onDecision(item.proposal.id, "clinician_review")} className="inline-flex min-h-12 items-center justify-center rounded-xl border border-amber-300 bg-white px-4 py-3 text-sm font-bold text-amber-900 hover:bg-amber-50 disabled:opacity-60">
                    <HeartPulse className="mr-2 h-4 w-4" aria-hidden="true" /> Ask my clinician
                  </button>
                  <button type="button" disabled={busy} onClick={() => onDecision(item.proposal.id, "deferred")} className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
                    <Clock3 className="mr-2 h-4 w-4" aria-hidden="true" /> Not now
                  </button>
                  <button type="button" disabled={busy} onClick={() => onDecision(item.proposal.id, "dismissed")} className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
                    <X className="mr-2 h-4 w-4" aria-hidden="true" /> Dismiss
                  </button>
                </div>
              ) : item.decision.status !== "adopted" ? (
                <button type="button" disabled={busy} onClick={() => onDecision(item.proposal.id, "review")} className="mt-4 inline-flex min-h-11 items-center rounded-xl border border-[#9DCFC3] bg-white px-4 py-2 text-sm font-bold text-[#06695F] hover:bg-[#EAFBF8] disabled:opacity-60">
                  Return to active review
                </button>
              ) : (
                <Link href="/routine" className="mt-4 inline-flex min-h-11 items-center text-sm font-bold text-[#087F72] hover:underline">Open in Routine</Link>
              )}
              {link ? <a href={link} target="_blank" rel="noopener noreferrer nofollow sponsored" className="mt-3 inline-flex text-sm font-bold text-[#087F72] hover:underline">Product information</a> : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function recommendationStatusLabel(status: RecommendationDecisionRecord["status"]): string {
  if (status === "clinician_review") return "Discuss with clinician";
  if (status === "deferred") return "Not now";
  if (status === "dismissed") return "Dismissed";
  if (status === "adopted") return "Added to Routine";
  return "Needs review";
}

function SupplementEditor({
  supplements,
  saving,
  onChange,
  onAdd,
  onCancel,
  onSave,
}: {
  supplements: MemberSupplement[];
  saving: boolean;
  onChange: (id: string, patch: Partial<MemberSupplement>) => void;
  onAdd: () => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const hasDoseIssues = supplements.some((item) => Boolean(doseIntegrityIssue(item.name, item.dose)));
  return (
    <div className="mt-6">
      <p className="rounded-xl bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-950">
        Mark an item stopped to preserve the history. Saving changes does not modify this older report.
      </p>
      <div className="mt-4 space-y-4">
        {supplements.map((item, index) => {
          const doseIssue = doseIntegrityIssue(item.name, item.dose);
          return <fieldset key={item.id} className="rounded-xl border border-slate-200 p-4">
            <legend className="px-1 text-sm font-bold text-[#041B2D]">Supplement {index + 1}</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name" required>
                <input
                  value={item.name}
                  onChange={(event) => onChange(item.id, { name: event.target.value })}
                  maxLength={120}
                  required
                  className={inputClass}
                />
              </Field>
              <Field label="Brand">
                <input
                  value={item.brand ?? ""}
                  onChange={(event) => onChange(item.id, { brand: event.target.value || null })}
                  maxLength={120}
                  className={inputClass}
                />
              </Field>
              <Field label="Dose">
                <input
                  value={item.dose ?? ""}
                  onChange={(event) => onChange(item.id, { dose: event.target.value || null })}
                  maxLength={120}
                  placeholder="Example: 200 mg"
                  className={inputClass}
                />
              </Field>
              <div className="text-sm font-semibold text-slate-700">
                <p>Timing</p>
                <p className="mt-1 min-h-11 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-normal text-slate-700">{item.timing || "Schedule not recorded"}</p>
              </div>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-600">Manage checklist timing and cadence in <Link href="/routine" className="font-bold text-[#087F72] hover:underline">Routine</Link> so every page uses the same schedule.</p>
            {doseIssue ? <p className="mt-3 flex items-start rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold leading-6 text-amber-950"><AlertTriangle className="mr-2 mt-1 h-4 w-4 shrink-0" aria-hidden="true" />{doseIssue.message} Correct it before saving.</p> : null}
            <label className="mt-4 flex min-h-11 cursor-pointer items-center gap-3 text-sm font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={item.active}
                onChange={(event) => onChange(item.id, { active: event.target.checked })}
                className="h-4 w-4 rounded border-slate-300 text-[#087F72] focus:ring-[#087F72]"
              />
              I currently take this supplement
            </label>
          </fieldset>;
        })}
      </div>
      <button
        type="button"
        onClick={onAdd}
        className="mt-4 inline-flex min-h-11 items-center text-sm font-bold text-[#087F72] hover:underline"
      >
        <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
        Add another supplement
      </button>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={onSave}
          disabled={saving || hasDoseIssues}
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#087F72] px-5 py-3 text-sm font-bold text-white hover:bg-[#06695F] disabled:opacity-60"
        >
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          {saving ? "Saving changes..." : "Save supplement changes"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 px-5 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function SupplementList({ supplements }: { supplements: MemberSupplement[] }) {
  if (supplements.length === 0) {
    return <p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">No supplements are currently saved.</p>;
  }
  return (
    <div className="mt-5 overflow-hidden rounded-xl border border-slate-200">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[42rem] border-collapse text-left text-sm">
          <caption className="sr-only">Current supplements, amounts, timing, and status</caption>
          <thead className="bg-slate-50 text-xs uppercase tracking-[0.08em] text-slate-600">
            <tr>
              <th scope="col" className="px-4 py-3 font-bold">Supplement</th>
              <th scope="col" className="px-4 py-3 font-bold">Amount</th>
              <th scope="col" className="px-4 py-3 font-bold">Timing</th>
              <th scope="col" className="px-4 py-3 text-right font-bold">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {supplements.map((item) => {
              const doseIssue = doseIntegrityIssue(item.name, item.dose);
              return (
                <tr key={item.id} className={item.active ? "" : "bg-slate-50 text-slate-500"}>
                  <th scope="row" className={`px-4 py-3 align-top font-semibold ${item.active ? "text-[#041B2D]" : "line-through"}`}>
                    {item.name}
                    {item.brand ? <span className="mt-0.5 block text-xs font-normal text-slate-500">{item.brand}</span> : null}
                  </th>
                  <td className="px-4 py-3 align-top text-slate-700">
                    {item.dose || "Not recorded"}
                    {doseIssue ? <span className="mt-1 block text-xs font-bold text-amber-800">Check amount and unit</span> : null}
                  </td>
                  <td className="px-4 py-3 align-top text-slate-700">{item.timing || "Not scheduled"}</td>
                  <td className="px-4 py-3 text-right align-top">
                    <span className={`inline-flex rounded-full px-2 py-1 text-xs font-bold ${item.active ? "bg-emerald-50 text-emerald-800" : "bg-slate-200 text-slate-600"}`}>
                      {item.active ? "Current" : "Stopped"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ReportSection({
  sectionNumber,
  name,
  body,
  stale,
  onEditSupplements,
  onRefresh,
  refreshing,
  safetyAcknowledged,
  acknowledgingSafety,
  unacknowledgingSafety,
  onAcknowledgeSafety,
  onMarkSafetyForReview,
  safetyNeedsReview,
}: {
  sectionNumber: number;
  name: string;
  body: string;
  stale: boolean;
  onEditSupplements: () => void;
  onRefresh: () => void;
  refreshing: boolean;
  safetyAcknowledged: boolean;
  acknowledgingSafety: boolean;
  unacknowledgingSafety: boolean;
  onAcknowledgeSafety: () => void;
  onMarkSafetyForReview: () => void;
  safetyNeedsReview: boolean;
}) {
  const isSafety = name.includes("Contraindications");
  const isCurrent = name === "Current Stack" || name === "Dosing & Notes";
  const isRecommendations = name === "Your Blueprint Recommendations";
  const sectionId = isSafety
    ? "safety-notes"
    : isRecommendations
      ? "recommendation-report"
      : `report-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`;
  return (
    <section id={sectionId} className={`scroll-mt-24 overflow-hidden rounded-2xl border bg-white shadow-sm ${isSafety ? "border-amber-200" : "border-slate-200"}`} aria-labelledby={`${sectionId}-title`}>
      <div className={`border-b px-5 py-4 ${isSafety ? "border-amber-200 bg-amber-50" : "border-slate-100 bg-slate-50/70"}`}>
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
          {String(sectionNumber).padStart(2, "0")} / {reportSectionCategory(name)}
        </p>
        <h3 id={`${sectionId}-title`} className={`mt-1 text-xl font-bold ${isSafety ? "text-amber-950" : "text-[#041B2D]"}`}>{reportSectionTitle(name)}</h3>
      </div>
      <div className="p-5 sm:p-6">
        {isSafety && stale ? (
          <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
            These cautions are based on an earlier input snapshot. Refresh before relying on them after a change.
          </p>
        ) : null}
        {isSafety && safetyNeedsReview && !stale && !safetyAcknowledged ? (
          <button
            type="button"
            onClick={onAcknowledgeSafety}
            disabled={acknowledgingSafety}
            className="mt-5 inline-flex min-h-11 items-center rounded-xl border border-amber-300 bg-white px-4 py-2 text-sm font-bold text-amber-900 hover:bg-amber-50 disabled:opacity-60"
          >
            {acknowledgingSafety ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="mr-2 h-4 w-4" aria-hidden="true" />}
            I have reviewed these safety notes
          </button>
        ) : null}
        {isSafety && safetyNeedsReview && !stale && safetyAcknowledged ? (
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <p className="inline-flex min-h-11 items-center rounded-xl bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-900">
              <CheckCircle2 className="mr-2 h-4 w-4" aria-hidden="true" /> Safety notes reviewed for this Blueprint
            </p>
            <button
              type="button"
              onClick={onMarkSafetyForReview}
              disabled={unacknowledgingSafety}
              className="inline-flex min-h-11 items-center px-2 py-2 text-sm font-bold text-[#06695F] hover:underline disabled:opacity-60"
            >
              {unacknowledgingSafety ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              Mark as needing review again
            </button>
          </div>
        ) : null}
        <BlueprintMarkdown name={name} body={body} />
        {isCurrent ? (
          <button type="button" onClick={onEditSupplements} className="mt-5 inline-flex min-h-11 items-center text-sm font-bold text-[#087F72] hover:underline">
            <Pencil className="mr-2 h-4 w-4" aria-hidden="true" />
            Correct current supplement information
          </button>
        ) : null}
        {isSafety && stale ? (
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-amber-800 px-4 py-2 text-sm font-bold text-white hover:bg-amber-900 disabled:opacity-60"
          >
            {refreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />}
            Refresh safety review
          </button>
        ) : null}
        {isRecommendations ? (
          <Link href="/plan" className="mt-5 inline-flex min-h-11 items-center text-sm font-bold text-[#087F72] hover:underline">
            Open current Plan
          </Link>
        ) : null}
      </div>
    </section>
  );
}

function BlueprintMarkdown({ name, body }: { name: string; body: string }) {
  const formattedBody = formatReportBody(name, body);
  return (
    <div className="report-prose prose prose-slate max-w-none prose-headings:text-[#041B2D] prose-p:leading-7 prose-li:my-1">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          table: ({ children }) => (
            <div className="my-5 overflow-x-auto rounded-xl border border-slate-200">
              <table className="m-0 w-full min-w-[38rem] border-collapse text-left text-sm">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-[#EFF5FA] text-[#041B2D]">{children}</thead>,
          th: ({ children }) => <th className="border-b border-slate-200 px-3 py-3 align-top font-bold">{children}</th>,
          td: ({ children }) => <td className="border-b border-slate-100 px-3 py-3 align-top leading-6">{children}</td>,
          tr: ({ children }) => <tr className="even:bg-slate-50/70">{children}</tr>,
          ul: ({ children }) => <ul className="my-4 space-y-2 pl-5 marker:text-[#087F72]">{children}</ul>,
          ol: ({ children }) => <ol className="my-4 space-y-2 pl-5 marker:font-bold marker:text-[#087F72]">{children}</ol>,
          blockquote: ({ children }) => <blockquote className="my-4 rounded-r-xl border-l-4 border-[#9DCFC3] bg-[#F4FAF8] px-4 py-3 not-italic">{children}</blockquote>,
          a: ({ href, children }) => {
            const external = Boolean(href && /^https?:\/\//i.test(href));
            return (
              <a
                href={href}
                target={external ? "_blank" : undefined}
                rel={external ? "noopener noreferrer" : undefined}
                className="font-semibold text-[#087F72] underline decoration-[#9DCFC3] underline-offset-2 hover:decoration-[#087F72]"
              >
                {children}
                {external ? <span className="sr-only"> (opens in a new tab)</span> : null}
              </a>
            );
          },
        }}
      >
        {formattedBody}
      </ReactMarkdown>
    </div>
  );
}

const listFormattedSections = new Set([
  "Contraindications & Med Interactions",
  "Dosing & Notes",
  "Evidence & References",
  "Shopping Links",
  "Follow-up Plan",
  "Lifestyle Foundations",
  "Longevity Levers",
]);

function formatReportBody(sectionName: string, body: string): string {
  const lines = body.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return body;
  if (!listFormattedSections.has(sectionName)) return body;

  return lines.map((line) => {
    if (/^#{1,6}\s|^[-*]\s|^\d+\.\s|^\|/.test(line)) return line;
    if (sectionName === "Shopping Links" && /^Affiliate disclosure:/i.test(line)) return line;
    if (sectionName === "Dosing & Notes" && (/^Starting points/i.test(line) || /^Keep prescribed/i.test(line))) return line;
    if (/^(Current Stack Notes|How to Measure Progress)$/i.test(line)) return `### ${line}`;
    return `- ${line}`;
  }).join("\n");
}

function reportSectionCategory(name: string): string {
  if (name.includes("Contraindications")) return "Safety review";
  if (name === "Current Stack" || name === "Dosing & Notes") return "Your regimen";
  if (name.includes("Recommendations") || name === "Shopping Links") return "Decisions";
  if (name === "Evidence & References") return "Evidence";
  if (name === "Follow-up Plan" || name === "This Week Try") return "Next steps";
  if (name === "Lifestyle Foundations" || name === "Longevity Levers") return "Lifestyle";
  return "Your foundation";
}

function SafetyBadge({ status, stale, acknowledged }: { status: StackSummary["safetyStatus"]; stale: boolean; acknowledged: boolean }) {
  if (stale) return <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-bold text-amber-900">Review after changes</span>;
  if (status === "safe") return <span className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-bold text-emerald-900">No material concern identified</span>;
  if (acknowledged) return <a href="#safety-notes" className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-bold text-emerald-900 hover:underline">Safety notes reviewed</a>;
  if (status === "warning") return <a href="#safety-notes" className="rounded-full bg-amber-100 px-3 py-1 text-sm font-bold text-amber-900 hover:underline">Review safety notes</a>;
  return <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-bold text-slate-700">Safety status pending</span>;
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="text-sm font-semibold text-slate-700">
      {label}{required ? <span className="text-red-700"> *</span> : null}
      <span className="mt-1 block">{children}</span>
    </label>
  );
}

function formatDate(value: string | null): string {
  if (!value) return "date unavailable";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "date unavailable"
    : date.toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      });
}

function messageForSupplementError(value: unknown): string {
  if (value === "duplicate_supplement") return "Each supplement should appear only once.";
  if (value === "invalid_supplement_name") return "Enter a valid supplement name. Medications and hormones belong in the broader health-context update.";
  if (value === "too_many_supplements") return "You can save up to 30 supplements.";
  if (value === "invalid_supplement_dose") return "Check the highlighted supplement amount and unit before saving.";
  return "We could not save those changes. Check the fields and try again.";
}

const inputClass = "min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-[#041B2D] outline-none focus:border-[#087F72] focus:ring-2 focus:ring-[#BCE3DA]";
