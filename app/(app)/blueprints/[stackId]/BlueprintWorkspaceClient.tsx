"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  FileDown,
  History,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import type { BlueprintActionCandidate } from "@/lib/blueprintActions";
import type { MemberSupplement } from "@/lib/blueprintWorkspace";
import { trackProductEvent } from "@/lib/productAnalyticsClient";
import { reportSectionTitle } from "@/lib/reportPresentation";

type StackSummary = {
  id: string;
  submissionId: string;
  createdAt: string | null;
  safetyStatus: "safe" | "warning" | "error" | null;
  generationReason: string | null;
};

type VersionSummary = {
  id: string;
  createdAt: string | null;
  safetyStatus: string | null;
  generationReason: string | null;
};

type Props = {
  stack: StackSummary;
  sections: Array<{ name: string; body: string }>;
  actions: BlueprintActionCandidate[];
  initialSupplements: MemberSupplement[];
  hasMemberOverride: boolean;
  initialStale: boolean;
  versioningReady: boolean;
  isLatest: boolean;
  history: VersionSummary[];
};

export default function BlueprintWorkspaceClient({
  stack,
  sections,
  actions,
  initialSupplements,
  hasMemberOverride,
  initialStale,
  versioningReady,
  isLatest,
  history,
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
  const [handoffId, setHandoffId] = useState<string | null>(null);

  useEffect(() => {
    trackProductEvent({ event_name: "blueprint_viewed", source: "blueprints" });
  }, []);

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
      setMessage("Your current supplements were updated. Refresh your Blueprint to review the new context.");
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
    try {
      const response = await fetch(`/api/blueprints/${encodeURIComponent(stack.id)}/refresh`, {
        method: "POST",
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok || !data?.stack_id) {
        throw new Error("We could not refresh your Blueprint. Your existing version is unchanged.");
      }
      window.location.assign(`/blueprints/${encodeURIComponent(data.stack_id)}?refreshed=1`);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "We could not refresh your Blueprint.");
      setRefreshing(false);
    }
  }

  async function startWeeklyPractice(actionId: string) {
    setHandoffId(actionId);
    setError(null);
    try {
      const response = await fetch("/api/blueprint-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stack_id: stack.id, action_id: actionId }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) {
        throw new Error("We could not start that practice. Please try again.");
      }
      trackProductEvent({ event_name: "blueprint_action_selected", source: "blueprints" });
      window.location.assign("/onboarding");
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "We could not start that practice.");
      setHandoffId(null);
    }
  }

  const activeCount = supplements.filter((item) => item.active).length;

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
              {isLatest ? "Current Blueprint" : "Previous Blueprint"}
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-[#041B2D] sm:text-4xl">
              Your health Blueprint
            </h1>
            <p className="mt-3 text-slate-600">
              Generated {formatDate(stack.createdAt)}. This is a dated snapshot of the information available at that time.
            </p>
          </div>
          <div className="flex flex-col items-start gap-3 sm:flex-row lg:flex-col lg:items-end">
            <SafetyBadge status={stack.safetyStatus} stale={stale} />
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
                {stack.generationReason ? "Your Blueprint may be out of date" : "Refresh recommended"}
              </h2>
              <p className="mt-1 text-sm leading-6 text-amber-900">
                Your current inputs differ from this report, or this version predates change tracking. The existing report
                stays available until you choose to create a refreshed version.
              </p>
              <button
                type="button"
                onClick={refreshBlueprint}
                disabled={refreshing || editing}
                className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-amber-800 px-5 py-3 text-sm font-bold text-white hover:bg-amber-900 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {refreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />}
                {refreshing ? "Refreshing Blueprint..." : "Refresh Blueprint and safety review"}
              </button>
            </div>
          </div>
        </section>
      ) : (
        <section className="mt-6 flex gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm leading-6 text-emerald-950">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" aria-hidden="true" />
          <p>This Blueprint reflects your current saved inputs. Recheck it whenever a supplement or other safety-relevant detail changes.</p>
        </section>
      )}

      {message ? <p role="status" className="mt-5 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900">{message}</p> : null}
      {error ? <p role="alert" className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-800">{error}</p> : null}

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <main className="min-w-0 space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#087F72]">Current health context</p>
                <h2 className="mt-1 text-2xl font-bold text-[#041B2D]">Your current supplements</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {activeCount} active {activeCount === 1 ? "supplement" : "supplements"}.
                  {hasMemberOverride ? " You have reviewed this list in LVE360." : " This list came from your original intake."}
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
                  Update supplements
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

          {actions.length > 0 ? (
            <section className="rounded-2xl border border-[#9DCFC3] bg-gradient-to-r from-[#EFF5FA] to-[#E6F7F3] p-6 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#122945]">Turn insight into practice</p>
              <h2 className="mt-1 text-2xl font-bold text-[#041B2D]">Choose one focus for this week</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Lifestyle actions can enter your weekly practice. Supplement or medication changes remain review-only.
              </p>
              <ol className="mt-5 grid gap-3 sm:grid-cols-2">
                {actions.map((action, index) => (
                  <li key={action.id} className="flex flex-col rounded-xl bg-white p-4 shadow-sm">
                    <p className="text-sm leading-6 text-slate-800"><strong>{index + 1}.</strong> {action.label}</p>
                    {action.kind === "lifestyle" ? (
                      <button
                        type="button"
                        onClick={() => startWeeklyPractice(action.id)}
                        disabled={handoffId !== null}
                        className="mt-auto pt-4 text-left text-sm font-bold text-[#087F72] hover:underline disabled:opacity-50"
                      >
                        {handoffId === action.id ? "Saving..." : "Start this weekly practice"}
                      </button>
                    ) : (
                      <p className="mt-auto pt-4 text-xs font-bold uppercase tracking-wide text-amber-700">
                        Keep for clinician review
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            </section>
          ) : null}

          {sections.map((section, index) => (
            <ReportSection
              key={section.name}
              name={section.name}
              body={section.body}
              defaultOpen={index < 2 || section.name.includes("Contraindications")}
              stale={stale}
              onEditSupplements={beginEditing}
              onRefresh={refreshBlueprint}
              refreshing={refreshing}
            />
          ))}
        </main>

        <aside className="space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <History className="h-5 w-5 text-[#087F72]" aria-hidden="true" />
              <h2 className="font-bold text-[#041B2D]">Version history</h2>
            </div>
            <ul className="mt-3 divide-y divide-slate-100">
              {history.map((version, index) => (
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
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 text-sm leading-6 text-slate-600 shadow-sm">
            <h2 className="font-bold text-[#041B2D]">When to update</h2>
            <p className="mt-2">
              Refresh after changing supplements. Update your broader health context when medications, conditions,
              allergies, hormones, pregnancy status, laboratory information, or major goals change.
            </p>
            <Link href="/quiz" className="mt-3 inline-flex font-bold text-[#087F72] hover:underline">
              Update broader health context
            </Link>
          </section>
        </aside>
      </div>
    </div>
  );
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
  return (
    <div className="mt-6">
      <p className="rounded-xl bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-950">
        Mark an item stopped to preserve the history. Saving changes does not modify this older report.
      </p>
      <div className="mt-4 space-y-4">
        {supplements.map((item, index) => (
          <fieldset key={item.id} className="rounded-xl border border-slate-200 p-4">
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
              <Field label="Timing">
                <input
                  value={item.timing ?? ""}
                  onChange={(event) => onChange(item.id, { timing: event.target.value || null })}
                  maxLength={160}
                  placeholder="Example: Evening with food"
                  className={inputClass}
                />
              </Field>
            </div>
            <label className="mt-4 flex min-h-11 cursor-pointer items-center gap-3 text-sm font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={item.active}
                onChange={(event) => onChange(item.id, { active: event.target.checked })}
                className="h-4 w-4 rounded border-slate-300 text-[#087F72] focus:ring-[#087F72]"
              />
              I currently take this supplement
            </label>
          </fieldset>
        ))}
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
          disabled={saving}
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
    <ul className="mt-5 divide-y divide-slate-100">
      {supplements.map((item) => (
        <li key={item.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className={`font-semibold ${item.active ? "text-[#041B2D]" : "text-slate-500 line-through"}`}>{item.name}</p>
            <p className="text-sm text-slate-500">
              {[item.brand, item.dose, item.timing].filter(Boolean).join(" · ") || "Details not provided"}
            </p>
          </div>
          <span className={`w-fit rounded-full px-2 py-1 text-xs font-bold ${item.active ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>
            {item.active ? "Current" : "Stopped"}
          </span>
        </li>
      ))}
    </ul>
  );
}

function ReportSection({
  name,
  body,
  defaultOpen,
  stale,
  onEditSupplements,
  onRefresh,
  refreshing,
}: {
  name: string;
  body: string;
  defaultOpen: boolean;
  stale: boolean;
  onEditSupplements: () => void;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const isSafety = name.includes("Contraindications");
  const isCurrent = name === "Current Stack" || name === "Dosing & Notes";
  const isRecommendations = name === "Your Blueprint Recommendations";
  return (
    <details open={defaultOpen} className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <summary className={`flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 font-bold marker:hidden ${isSafety ? "bg-amber-50 text-amber-950" : "bg-white text-[#041B2D]"}`}>
        {reportSectionTitle(name)}
        <ChevronDown className="h-5 w-5 shrink-0 transition group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="border-t border-slate-100 p-5 sm:p-6">
        {isSafety && stale ? (
          <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
            These cautions are based on an earlier input snapshot. Refresh before relying on them after a change.
          </p>
        ) : null}
        <div className="report-prose prose prose-slate max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
        </div>
        {isCurrent ? (
          <button type="button" onClick={onEditSupplements} className="mt-5 inline-flex min-h-11 items-center text-sm font-bold text-[#087F72] hover:underline">
            <Pencil className="mr-2 h-4 w-4" aria-hidden="true" />
            Update my current supplements
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
          <Link href="/today#todays-plan" className="mt-5 inline-flex min-h-11 items-center text-sm font-bold text-[#087F72] hover:underline">
            Review my current plan
          </Link>
        ) : null}
      </div>
    </details>
  );
}

function SafetyBadge({ status, stale }: { status: StackSummary["safetyStatus"]; stale: boolean }) {
  if (stale) return <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-bold text-amber-900">Review after changes</span>;
  if (status === "safe") return <span className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-bold text-emerald-900">No material concern identified</span>;
  if (status === "warning") return <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-bold text-amber-900">Review safety notes</span>;
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
    : date.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
}

function messageForSupplementError(value: unknown): string {
  if (value === "duplicate_supplement") return "Each supplement should appear only once.";
  if (value === "invalid_supplement_name") return "Enter a valid supplement name. Medications and hormones belong in the broader health-context update.";
  if (value === "too_many_supplements") return "You can save up to 30 supplements.";
  return "We could not save those changes. Check the fields and try again.";
}

const inputClass = "min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-[#041B2D] outline-none focus:border-[#087F72] focus:ring-2 focus:ring-[#BCE3DA]";
