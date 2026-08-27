"use client";

import {
  AlertTriangle,
  Check,
  ChevronRight,
  CirclePlus,
  Clock3,
  ExternalLink,
  HeartPulse,
  ListChecks,
  Loader2,
  PackageOpen,
  Pencil,
  Pill,
  Printer,
  RotateCcw,
  Search,
  ShieldAlert,
  Sparkles,
  TestTube2,
  X,
} from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

import RoutineCopilotPanel from "@/components/routine/RoutineCopilotPanel";
import {
  groupRoutineItems,
  isClinicianReviewProposal,
  ROUTINE_SECTION_LABELS,
  routineScheduleConflicts,
  routineScheduleLabel,
  routineInstructionAuthorityLabel,
  routineSourceLabel,
  routineWrittenScheduleLabel,
  type RoutineItem,
  type RoutineItemKind,
} from "@/lib/routine";
import {
  MEDICATION_AUTHORITY_LABELS,
  MEDICATION_INSTRUCTION_AUTHORITIES,
  REGIMEN_AUTHORITY_LABELS,
  REGIMEN_INSTRUCTION_AUTHORITIES,
  type MedicationInstructionAuthority,
  type RegimenInstructionAuthority,
} from "@/lib/medicationRecord";
import { doseIntegrityIssue } from "@/lib/doseIntegrity";
import type { MemberRecommendationDecision } from "@/lib/recommendationDecision";
import ScheduleEditor, {
  scheduleDraft,
  scheduleDraftIsReady,
  scheduleDraftPayload,
  type ScheduleDraft,
} from "./ScheduleEditor";
import TodayDoses from "./TodayDoses";

type LatestStack = { id: string; submission_id: string | null; created_at: string } | null;
type ToastState = { message: string; undo?: () => Promise<void> } | null;
type RoutineView = "today" | "medications" | "hormones" | "supplements";
type RoutineEditPatch = {
  dose?: string | null;
  timing?: string | null;
  doseConfirmed?: boolean;
  schedule?: RoutineItem["schedule"];
  instructionAuthority?: RegimenInstructionAuthority;
  brand?: string | null;
  reorderUrl?: string | null;
};
type SearchItem = {
  vendor: "fullscript" | "fallback" | "member";
  sku: string | null;
  name: string;
  brand: string | null;
  dose: string | null;
  link_fullscript: string | null;
  link_amazon: string | null;
  price: number | null;
  reorder_url: string | null;
  image_url: string | null;
};

const SECTION_DESCRIPTIONS: Record<RoutineItemKind, string> = {
  medication: "Your reported prescriptions. Follow your prescription label and clinician instructions.",
  hormone: "Your reported hormone therapies. Dose changes belong with your prescriber.",
  supplement: "Your current supplements and the schedule you recorded.",
  endocrine_active_supplement: "Supplements that may affect hormone pathways and deserve extra care.",
};

export default function RoutineClient({
  initialItems,
  latestStack,
}: {
  initialItems: RoutineItem[];
  latestStack: LatestStack;
}) {
  const [items, setItems] = useState(initialItems);
  const [editing, setEditing] = useState<RoutineItem | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showAddMedication, setShowAddMedication] = useState(false);
  const [showAddHormone, setShowAddHormone] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [doseRefreshToken, setDoseRefreshToken] = useState(0);
  const [activeView, setActiveView] = useState<RoutineView>("today");
  const grouped = useMemo(() => groupRoutineItems(items), [items]);
  const supplements = useMemo(
    () => [...grouped.byKind.supplement, ...grouped.byKind.endocrine_active_supplement],
    [grouped]
  );

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 7000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const hash = window.location.hash;
    if (hash === "#routine-ideas") {
      setActiveView("supplements");
      return;
    }
    const prefix = "#edit-routine-item-";
    if (!hash.startsWith(prefix)) return;
    const itemId = decodeURIComponent(hash.slice(prefix.length));
    const item = initialItems.find((candidate) => candidate.id === itemId);
    if (!item) return;
    setActiveView(item.item_kind === "medication" ? "medications" : item.item_kind === "hormone" ? "hormones" : "supplements");
    setEditing(item);
  }, [initialItems]);

  async function refreshRoutine() {
    const response = await fetch("/api/stacks/combined", { cache: "no-store" });
    const body = await response.json().catch(() => null);
    if (!response.ok || !body?.ok) throw new Error(body?.error ?? "routine_unavailable");
    setItems(body.items ?? []);
    setDoseRefreshToken((current) => current + 1);
  }

  async function updateItem(id: string, patch: Record<string, unknown>) {
    const response = await fetch("/api/stacks/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || !body?.ok) throw new Error(body?.error ?? "routine_update_failed");
  }

  async function saveEdit(item: RoutineItem, patch: RoutineEditPatch) {
    setBusyId(item.id);
    const previous = {
      dose: item.dose,
      timing: item.timing,
      doseConfirmed: Boolean(doseIntegrityIssue(item.name, item.dose)),
      schedule: item.schedule ?? null,
      instructionAuthority: item.instruction_authority ?? undefined,
      brand: item.brand,
      reorderUrl: item.reorder_url,
    };
    try {
      await updateItem(item.id, patch);
      await refreshRoutine();
      setEditing(null);
      setToast({
        message: `${item.name} was updated.${item.item_kind === "medication" || item.item_kind === "hormone" ? " Review your Blueprint after this change." : ""}`,
        undo: async () => {
          await updateItem(item.id, {
            ...previous,
            ...(previous.instructionAuthority || patch.instructionAuthority
              ? { instructionAuthority: previous.instructionAuthority ?? patch.instructionAuthority }
              : {}),
          });
          await refreshRoutine();
          setToast({ message: `Changes to ${item.name} were undone.` });
        },
      });
    } catch {
      setToast({ message: "We could not save that change. Your previous routine is unchanged." });
    } finally {
      setBusyId(null);
    }
  }

  async function stopTracking(item: RoutineItem) {
    if (item.item_kind === "medication" || item.item_kind === "hormone") {
      const label = item.item_kind === "hormone" ? "hormone therapy" : "medication";
      const confirmed = window.confirm(
        `Only stop tracking this ${label} if it reflects your current prescribed list. LVE360 is not advising you to discontinue or change it.`
      );
      if (!confirmed) return;
    }
    setBusyId(item.id);
    try {
      await updateItem(item.id, { active: false });
      setItems((current) => current.filter((candidate) => candidate.id !== item.id));
      setToast({
        message: `${item.name} is no longer in your current routine.`,
        undo: async () => {
          await updateItem(item.id, { active: true });
          await refreshRoutine();
          setToast({ message: `${item.name} is back in your current routine.` });
        },
      });
    } catch {
      setToast({ message: "We could not change that item. Your current routine is unchanged." });
    } finally {
      setBusyId(null);
    }
  }

  async function adoptProposal(item: RoutineItem) {
    if (isClinicianReviewProposal(item) || (item.recommendation_overlaps?.length ?? 0) > 0) {
      const confirmed = window.confirm(
        "This idea needs an overlap or clinician review. Only add it if you have already decided it belongs in your routine."
      );
      if (!confirmed) return;
    }
    setBusyId(item.id);
    try {
      const response = await fetch("/api/stack-items/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: item.id }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.ok || !body?.item?.id) throw new Error("adoption_failed");
      await refreshRoutine();
      const adoptedId = body.item.id as string;
      setToast({
        message: `${item.name} was added to your current routine.`,
        undo: async () => {
          await updateItem(adoptedId, { active: false });
          await fetch("/api/recommendations/decision", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ item_id: item.id, decision: "review" }),
          });
          await refreshRoutine();
          setToast({ message: `${item.name} was returned to ideas to consider.` });
        },
      });
    } catch {
      setToast({ message: "We could not add that idea. Your current routine is unchanged." });
    } finally {
      setBusyId(null);
    }
  }

  async function updateProposalDecision(item: RoutineItem, decision: MemberRecommendationDecision) {
    setBusyId(item.id);
    try {
      const response = await fetch("/api/recommendations/decision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: item.id, decision }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.ok) throw new Error(body?.error ?? "recommendation_decision_failed");
      await refreshRoutine();
      const message = decision === "clinician_review"
        ? `${item.name} is marked for clinician or healthcare provider review.`
        : decision === "deferred"
          ? `${item.name} was moved out of your active ideas for now.`
          : decision === "dismissed"
            ? `${item.name} was dismissed for this health context.`
            : `${item.name} is back under review.`;
      setToast({ message });
    } catch {
      setToast({ message: "We could not save that recommendation decision. Nothing changed." });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-[#041B2D]">Your current routine</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            {grouped.current.length} current item{grouped.current.length === 1 ? "" : "s"}
            {latestStack?.created_at ? `, reviewed against your latest Blueprint from ${formatDate(latestStack.created_at)}` : ""}.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
          <a
            href="/routine/print"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-300 bg-white px-5 py-3 font-bold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087F72]"
          >
            <Printer className="mr-2 h-5 w-5" aria-hidden="true" />
            Print clinician list
          </a>
          <button
            type="button"
            onClick={() => setShowAddMedication(true)}
            className="inline-flex min-h-12 items-center justify-center rounded-xl border border-[#087F72] bg-white px-5 py-3 font-bold text-[#06695F] transition hover:bg-[#EAFBF8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087F72]"
          >
            <Pill className="mr-2 h-5 w-5" aria-hidden="true" />
            Add a medication
          </button>
          <button
            type="button"
            onClick={() => setShowAddHormone(true)}
            className="inline-flex min-h-12 items-center justify-center rounded-xl border border-[#087F72] bg-white px-5 py-3 font-bold text-[#06695F] transition hover:bg-[#EAFBF8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087F72]"
          >
            <TestTube2 className="mr-2 h-5 w-5" aria-hidden="true" />
            Add a hormone
          </button>
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="inline-flex min-h-12 items-center justify-center rounded-xl bg-[#087F72] px-5 py-3 font-bold text-white transition hover:bg-[#06695F] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087F72] focus-visible:ring-offset-2"
          >
            <CirclePlus className="mr-2 h-5 w-5" aria-hidden="true" />
            Add a supplement
          </button>
        </div>
      </div>

      <nav aria-label="Routine sections" className="grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm lg:grid-cols-4">
        {([
          { id: "today", label: "Today", count: null, icon: ListChecks },
          { id: "medications", label: "Medications", count: grouped.byKind.medication.length, icon: Pill },
          { id: "hormones", label: "Hormones", count: grouped.byKind.hormone.length, icon: TestTube2 },
          { id: "supplements", label: "Supplements", count: supplements.length, icon: Sparkles },
        ] as const).map((view) => {
          const Icon = view.icon;
          const selected = activeView === view.id;
          return (
            <button
              key={view.id}
              type="button"
              aria-current={selected ? "page" : undefined}
              onClick={() => setActiveView(view.id)}
              className={`inline-flex min-h-12 items-center justify-center rounded-xl px-3 py-3 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087F72] ${selected ? "bg-[#087F72] text-white" : "text-slate-700 hover:bg-[#EAFBF8] hover:text-[#06695F]"}`}
            >
              <Icon className="mr-2 h-5 w-5" aria-hidden="true" />
              {view.label}{view.count === null ? "" : ` (${view.count})`}
            </button>
          );
        })}
      </nav>

      {activeView === "today" ? (
        <TodayDoses
          refreshToken={doseRefreshToken}
          scheduleReviewItems={grouped.current.filter((item) => !item.schedule)}
          onEditSchedule={setEditing}
        />
      ) : null}

      {activeView === "medications" ? (
        <div className="space-y-5">
          <RoutineSection
            kind="medication"
            items={grouped.byKind.medication}
            busyId={busyId}
            onEdit={setEditing}
            onStop={stopTracking}
          />
        </div>
      ) : null}

      {activeView === "hormones" ? (
        <div className="space-y-5">
          <RoutineSection kind="hormone" items={grouped.byKind.hormone} busyId={busyId} onEdit={setEditing} onStop={stopTracking} />
        </div>
      ) : null}

      {activeView === "supplements" ? (
        <div className="space-y-5">
          <RoutineSection kind="supplement" items={supplements} busyId={busyId} onEdit={setEditing} onStop={stopTracking} />
          <IdeasSection items={grouped.proposals} busyId={busyId} onAdopt={adoptProposal} onDecision={updateProposalDecision} />
        </div>
      ) : null}

      {editing ? (
        <EditRoutineDialog
          item={editing}
          saving={busyId === editing.id}
          onClose={() => setEditing(null)}
          onSave={saveEdit}
        />
      ) : null}

      {showAdd ? (
        <AddSupplementDialog
          onClose={() => setShowAdd(false)}
          onAdded={async (itemName, addedId) => {
            await refreshRoutine();
            setShowAdd(false);
            setActiveView("supplements");
            setToast({
              message: `${itemName} was added to your current routine.`,
              undo: async () => {
                await updateItem(addedId, { active: false });
                await refreshRoutine();
                setToast({ message: `${itemName} was removed from your current routine.` });
              },
            });
          }}
        />
      ) : null}

      {showAddMedication ? (
        <AddPrescribedItemDialog
          kind="medication"
          onClose={() => setShowAddMedication(false)}
          onAdded={async (itemName, addedId) => {
            await refreshRoutine();
            setShowAddMedication(false);
            setActiveView("medications");
            setToast({
              message: `${itemName} was added as a medication you reported. Review your Blueprint after this change.`,
              undo: async () => {
                await updateItem(addedId, { active: false });
                await refreshRoutine();
                setToast({ message: `${itemName} was removed from your current routine.` });
              },
            });
          }}
        />
      ) : null}

      {showAddHormone ? (
        <AddPrescribedItemDialog
          kind="hormone"
          onClose={() => setShowAddHormone(false)}
          onAdded={async (itemName, addedId) => {
            await refreshRoutine();
            setShowAddHormone(false);
            setActiveView("hormones");
            setToast({
              message: `${itemName} was added as a hormone therapy you reported. Review your Blueprint after this change.`,
              undo: async () => {
                await updateItem(addedId, { active: false });
                await refreshRoutine();
                setToast({ message: `${itemName} was removed from your current routine.` });
              },
            });
          }}
        />
      ) : null}

      {toast ? (
        <div className="fixed inset-x-0 bottom-5 z-[70] flex justify-center px-4" aria-live="polite">
          <div className="flex w-full max-w-xl items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-[#041B2D] shadow-xl">
            <span>{toast.message}</span>
            {toast.undo ? (
              <button
                type="button"
                onClick={() => void toast.undo?.()}
                className="inline-flex min-h-11 shrink-0 items-center rounded-xl px-3 py-2 text-[#087F72] hover:bg-[#EAFBF8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087F72]"
              >
                <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" /> Undo
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}

function RoutineSection({
  kind,
  items,
  busyId,
  onEdit,
  onStop,
}: {
  kind: RoutineItemKind;
  items: RoutineItem[];
  busyId: string | null;
  onEdit: (item: RoutineItem) => void;
  onStop: (item: RoutineItem) => void;
}) {
  const Icon = kind === "medication" ? Pill : kind === "hormone" ? TestTube2 : kind === "endocrine_active_supplement" ? HeartPulse : Sparkles;
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6" aria-labelledby={`routine-${kind}`}>
      <div className="flex items-start gap-3">
        <span className="rounded-xl bg-[#EAFBF8] p-2.5 text-[#087F72]"><Icon className="h-6 w-6" aria-hidden="true" /></span>
        <div>
          <h2 id={`routine-${kind}`} className="text-xl font-bold text-[#041B2D]">{ROUTINE_SECTION_LABELS[kind]}</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">{SECTION_DESCRIPTIONS[kind]}</p>
        </div>
      </div>
      {items.length ? (
        <ul className="mt-5 grid gap-3 lg:grid-cols-2">
          {items.map((item) => (
            <RoutineCard key={item.id} item={item} busy={busyId === item.id} onEdit={onEdit} onStop={onStop} />
          ))}
        </ul>
      ) : (
        <p className="mt-5 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
          No current {ROUTINE_SECTION_LABELS[kind].toLowerCase()} recorded.
        </p>
      )}
    </section>
  );
}

function RoutineCard({
  item,
  busy,
  onEdit,
  onStop,
}: {
  item: RoutineItem;
  busy: boolean;
  onEdit: (item: RoutineItem) => void;
  onStop: (item: RoutineItem) => void;
}) {
  const prescribedItem = item.item_kind === "medication" || item.item_kind === "hormone";
  const supplementItem = !prescribedItem;
  const hormoneActive = item.item_kind === "endocrine_active_supplement";
  const authorityLabel = routineInstructionAuthorityLabel(item.instruction_authority);
  const doseIssue = doseIntegrityIssue(item.name, item.dose);
  const scheduleConflicts = routineScheduleConflicts(item);
  return (
    <li className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-start gap-4">
        {supplementItem ? (
          item.image_url ? (
            item.reorder_url ? (
              <a href={item.reorder_url} target="_blank" rel="noopener noreferrer nofollow sponsored" className="relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087F72]" aria-label={`Open product page for ${item.name}`}>
                <Image src={item.image_url} alt={`${item.brand ? `${item.brand} ` : ""}${item.name} product`} fill sizes="96px" className="object-contain p-2" />
              </a>
            ) : (
              <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <Image src={item.image_url} alt={`${item.brand ? `${item.brand} ` : ""}${item.name} product`} fill sizes="96px" className="object-contain p-2" />
              </div>
            )
          ) : (
            <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white text-slate-400" aria-label="Product image not available">
              <PackageOpen className="h-9 w-9" aria-hidden="true" />
            </div>
          )
        ) : null}
        <div className="min-w-0">
          <h3 className="text-lg font-bold text-[#041B2D]">{item.name}</h3>
          {item.brand ? <p className="mt-1 font-semibold text-slate-700">{item.brand}</p> : null}
          <p className="mt-1 text-sm text-slate-600">{routineSourceLabel(item.instruction_source)}</p>
          {hormoneActive ? <p className="mt-2 inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-900"><HeartPulse className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Hormone-active supplement</p> : null}
        </div>
        {busy ? <Loader2 className="ml-auto h-5 w-5 shrink-0 animate-spin text-[#087F72]" aria-label="Saving" /> : null}
      </div>
      <dl className="mt-4 space-y-3 text-sm">
        <div>
          <dt className="font-bold text-[#041B2D]">{prescribedItem ? "Reported dose at each scheduled time" : "Recorded amount at each scheduled time"}</dt>
          <dd className="mt-0.5 text-slate-700">{item.dose?.trim() || "Dose not recorded"}</dd>
        </div>
        <div>
          <dt className="flex items-center font-bold text-[#041B2D]"><Clock3 className="mr-1.5 h-4 w-4" aria-hidden="true" /> Schedule</dt>
          <dd className={`mt-0.5 ${routineScheduleLabel(item) === "Schedule not recorded" ? "font-semibold text-amber-700" : "text-slate-700"}`}>
            {routineScheduleLabel(item)}
          </dd>
        </div>
        {item.purpose ? <div><dt className="font-bold text-[#041B2D]">Purpose you reported</dt><dd className="mt-0.5 text-slate-700">{item.purpose}</dd></div> : null}
        {authorityLabel ? <div><dt className="font-bold text-[#041B2D]">Instruction source</dt><dd className="mt-0.5 text-slate-700">{authorityLabel}</dd></div> : null}
      </dl>
      {doseIssue ? (
        <p className="mt-4 flex items-start rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold leading-6 text-amber-950">
          <AlertTriangle className="mr-2 mt-1 h-4 w-4 shrink-0" aria-hidden="true" />
          {doseIssue.message}
        </p>
      ) : null}
      {scheduleConflicts.length ? (
        <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
          <p className="flex items-start font-bold text-[#6F3B00]">
            <AlertTriangle className="mr-2 mt-1 h-4 w-4 shrink-0" aria-hidden="true" />
            Schedule needs confirmation
          </p>
          <dl className="mt-2 grid gap-2">
            <div><dt className="font-semibold">Written schedule</dt><dd>{routineWrittenScheduleLabel(item)}</dd></div>
            <div><dt className="font-semibold">Checklist schedule</dt><dd>{routineScheduleLabel(item)}</dd></div>
          </dl>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {scheduleConflicts.map((conflict) => <li key={conflict.code}>{conflict.reason}</li>)}
          </ul>
          <p className="mt-2">Nothing has been changed. Confirm the intended cadence and times before relying on the checklist.</p>
          <button
            type="button"
            disabled={busy}
            onClick={() => onEdit(item)}
            className="mt-3 inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-amber-400 bg-white px-4 py-3 font-bold text-[#6F3B00] hover:bg-amber-100 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
          >
            <Pencil className="mr-2 h-4 w-4" aria-hidden="true" /> Review schedule
          </button>
        </div>
      ) : null}
      {prescribedItem ? (
        <p className="mt-4 rounded-xl bg-white p-3 text-xs leading-5 text-slate-600">
          LVE360 records what you report. It does not select or recommend prescription doses. Follow your prescription label and clinician instructions.
        </p>
      ) : null}
      {supplementItem && item.reorder_url ? (
        <div className="mt-4">
          <a href={item.reorder_url} target="_blank" rel="noopener noreferrer nofollow sponsored" className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-[#041B2D] px-4 py-3 font-bold text-white hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087F72] focus-visible:ring-offset-2">
            <ExternalLink className="mr-2 h-4 w-4" aria-hidden="true" /> Open product or reorder link
          </a>
          {item.product_source !== "member" ? <p className="mt-2 text-xs leading-5 text-slate-500">Product links may be affiliate links. Your price does not change.</p> : null}
        </div>
      ) : null}
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => onEdit(item)}
          className="inline-flex min-h-12 items-center justify-center rounded-xl border border-[#9DCFC3] bg-white px-4 py-3 font-bold text-[#06695F] hover:bg-[#EAFBF8] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087F72]"
        >
          <Pencil className="mr-2 h-4 w-4" aria-hidden="true" /> {prescribedItem ? "Record dose or schedule change" : "Edit supplement details"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void onStop(item)}
          className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-3 font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087F72]"
        >
          <X className="mr-2 h-4 w-4" aria-hidden="true" /> Stop tracking
        </button>
      </div>
    </li>
  );
}

function IdeasSection({
  items,
  busyId,
  onAdopt,
  onDecision,
}: {
  items: RoutineItem[];
  busyId: string | null;
  onAdopt: (item: RoutineItem) => void;
  onDecision: (item: RoutineItem, decision: MemberRecommendationDecision) => void;
}) {
  return (
    <section className="scroll-mt-24 rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm sm:p-6" aria-labelledby="routine-ideas">
      <div className="flex items-start gap-3">
        <span className="rounded-xl bg-white p-2.5 text-amber-700"><ShieldAlert className="h-6 w-6" aria-hidden="true" /></span>
        <div>
          <h2 id="routine-ideas" className="text-xl font-bold text-[#041B2D]">Ideas to consider</h2>
          <p className="mt-1 text-sm leading-6 text-amber-900">These Blueprint ideas are not current. They only move into your routine after you explicitly add them.</p>
        </div>
      </div>
      {items.length ? (
        <ul className="mt-5 grid gap-3 lg:grid-cols-2">
          {items.map((item) => {
            const clinicianReview = isClinicianReviewProposal(item);
            const link = item.link_fullscript || item.link_amazon;
            return (
              <li key={item.id} className="rounded-2xl border border-amber-200 bg-white p-4">
                <h3 className="text-lg font-bold text-[#041B2D]">{item.name}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-700">{item.recommendation_reason || item.purpose || "Review the evidence and safety context in your Blueprint."}</p>
                {item.recommendation_overlaps?.length ? (
                  <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-950">
                    <strong>Check what you already take:</strong> Your current routine includes {item.recommendation_overlaps.join(", ")}. Review the ingredient label before adding another source.
                  </p>
                ) : null}
                {clinicianReview ? <p className="mt-3 flex items-start rounded-xl bg-amber-100 p-3 text-sm font-semibold text-amber-900"><AlertTriangle className="mr-2 mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> Clinician or healthcare provider review is recommended before adding this.</p> : null}
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    disabled={busyId === item.id}
                    onClick={() => void onAdopt(item)}
                    className="inline-flex min-h-12 items-center justify-center rounded-xl bg-[#087F72] px-4 py-3 font-bold text-white hover:bg-[#06695F] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087F72] focus-visible:ring-offset-2"
                  >
                    {busyId === item.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="mr-2 h-4 w-4" aria-hidden="true" />}
                    {clinicianReview ? "Add after review" : "Add to current routine"}
                  </button>
                  <button type="button" disabled={busyId === item.id} onClick={() => void onDecision(item, "clinician_review")} className="inline-flex min-h-12 items-center justify-center rounded-xl border border-amber-300 px-4 py-3 font-bold text-amber-900 hover:bg-amber-100 disabled:opacity-60">
                    <HeartPulse className="mr-2 h-4 w-4" aria-hidden="true" /> Ask my clinician
                  </button>
                  <button type="button" disabled={busyId === item.id} onClick={() => void onDecision(item, "deferred")} className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-300 px-4 py-3 font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
                    <Clock3 className="mr-2 h-4 w-4" aria-hidden="true" /> Not now
                  </button>
                  <button type="button" disabled={busyId === item.id} onClick={() => void onDecision(item, "dismissed")} className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-300 px-4 py-3 font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
                    <X className="mr-2 h-4 w-4" aria-hidden="true" /> Dismiss
                  </button>
                  {link ? <a href={link} target="_blank" rel="noopener noreferrer nofollow sponsored" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-amber-300 px-4 py-3 font-bold text-amber-900 hover:bg-amber-100 sm:col-span-2"><ExternalLink className="mr-2 h-4 w-4" aria-hidden="true" /> Product information</a> : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : <p className="mt-5 rounded-xl bg-white p-4 text-sm text-slate-600">No new Blueprint ideas are waiting for review.</p>}
    </section>
  );
}

function EditRoutineDialog({ item, saving, onClose, onSave }: { item: RoutineItem; saving: boolean; onClose: () => void; onSave: (item: RoutineItem, patch: RoutineEditPatch) => void }) {
  const prescribedItem = item.item_kind === "medication" || item.item_kind === "hormone";
  const [dose, setDose] = useState(item.dose ?? "");
  const [timing, setTiming] = useState(item.timing ?? "");
  const [brand, setBrand] = useState(item.brand ?? "");
  const [reorderUrl, setReorderUrl] = useState(item.reorder_url ?? "");
  const [schedule, setSchedule] = useState<ScheduleDraft>(() => scheduleDraft(item.schedule));
  const [instructionAuthority, setInstructionAuthority] = useState<RegimenInstructionAuthority | "">(
    item.instruction_authority ?? ""
  );
  const [doseConfirmed, setDoseConfirmed] = useState(false);
  const authorities = prescribedItem
    ? MEDICATION_INSTRUCTION_AUTHORITIES
    : REGIMEN_INSTRUCTION_AUTHORITIES.filter((authority) => authority !== "medication_label");
  const hasStructuredSchedule = Boolean(schedule.cadence);
  const scheduleReady = !hasStructuredSchedule || scheduleDraftIsReady(schedule);
  const sourceRequired = prescribedItem || hasStructuredSchedule;
  const reorderUrlReady = !reorderUrl.trim() || isValidHttpsUrl(reorderUrl);
  const doseIssue = doseIntegrityIssue(item.name, dose);
  const draftSchedule = hasStructuredSchedule && scheduleReady ? scheduleDraftPayload(schedule) : null;
  const draftScheduleConflicts = routineScheduleConflicts({
    timing,
    timing_text: timing,
    schedule: draftSchedule,
  });
  return (
    <DialogShell title={prescribedItem ? `Record a prescribed change for ${item.name}` : `Update ${item.name}`} onClose={onClose}>
      <p className="text-sm leading-6 text-slate-600">
        {prescribedItem
          ? "Use this only to record a change you received from your clinician, healthcare provider, or current prescription label. LVE360 is not changing or recommending your prescription."
          : "Record what you currently do. This does not create a medical instruction or replace a product label."}
      </p>
      <RoutineCopilotPanel
        kind={item.item_kind}
        existingName={item.name}
        onApply={(proposal) => {
          if (proposal.dose) {
            setDose(proposal.dose);
            setDoseConfirmed(false);
          }
          if (proposal.timing) setTiming(proposal.timing);
          if (proposal.schedule) setSchedule(scheduleDraft(proposal.schedule));
        }}
      />
      <label className="mt-5 block text-sm font-bold text-[#041B2D]">{prescribedItem ? "Prescribed dose at each scheduled time" : "Amount at each scheduled time"}<input autoFocus value={dose} onChange={(event) => { setDose(event.target.value); setDoseConfirmed(false); }} maxLength={120} className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 px-4 py-3 font-normal outline-none focus:border-[#087F72] focus:ring-2 focus:ring-[#087F72]/20" placeholder={item.item_kind === "hormone" ? "For example, 80 mg" : "For example, 2 capsules"} /></label>
      {item.schedule && item.schedule.times.length > 1 ? <p className="mt-2 text-sm leading-6 text-slate-600">This amount is shown for every scheduled time. If the amount is a full-day total, enter the amount you take at one scheduled time instead.</p> : null}
      {doseIssue ? (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
          <p className="font-semibold">{doseIssue.message}</p>
          <label className="mt-3 flex min-h-11 cursor-pointer items-start gap-3 font-semibold">
            <input type="checkbox" checked={doseConfirmed} onChange={(event) => setDoseConfirmed(event.target.checked)} className="mt-1 h-4 w-4 rounded border-amber-400 text-[#087F72] focus:ring-[#087F72]" />
            I checked the amount and unit against the current label or instruction.
          </label>
        </div>
      ) : null}
      {!prescribedItem ? (
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-bold text-[#041B2D]">Brand <span className="font-normal text-slate-500">(optional)</span><input value={brand} onChange={(event) => setBrand(event.target.value)} maxLength={120} className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 px-4 py-3 font-normal outline-none focus:border-[#087F72] focus:ring-2 focus:ring-[#087F72]/20" placeholder="For example, Thorne" /></label>
          <label className="block text-sm font-bold text-[#041B2D]">Product or reorder link <span className="font-normal text-slate-500">(optional)</span><input type="url" inputMode="url" value={reorderUrl} onChange={(event) => setReorderUrl(event.target.value)} maxLength={2048} className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 px-4 py-3 font-normal outline-none focus:border-[#087F72] focus:ring-2 focus:ring-[#087F72]/20" placeholder="https://..." aria-invalid={!reorderUrlReady} /></label>
          {!reorderUrlReady ? <p className="text-sm font-semibold text-rose-700 sm:col-span-2">Use a complete secure link that begins with https://.</p> : null}
        </div>
      ) : null}
      <label className="mt-5 block text-sm font-bold text-[#041B2D]">Written schedule <span className="font-normal text-slate-500">(copied from your current instructions)</span><input value={timing} onChange={(event) => setTiming(event.target.value)} maxLength={160} className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 px-4 py-3 font-normal outline-none focus:border-[#087F72] focus:ring-2 focus:ring-[#087F72]/20" placeholder="For example, once weekly on Sunday" /></label>
      <ScheduleEditor value={schedule} onChange={setSchedule} />
      {draftScheduleConflicts.length ? (
        <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
          <p className="font-bold">These two schedule records still disagree.</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {draftScheduleConflicts.map((conflict) => <li key={conflict.code}>{conflict.reason}</li>)}
          </ul>
          <p className="mt-2">Use your current label or clinician or healthcare provider instructions to confirm the intended cadence and times. Saving will record your confirmation.</p>
        </div>
      ) : null}
      {sourceRequired ? (
        <label className="mt-5 block text-sm font-bold text-[#041B2D]">
          Where did this instruction come from?
          <select value={instructionAuthority} onChange={(event) => setInstructionAuthority(event.target.value as RegimenInstructionAuthority)} className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 font-normal outline-none focus:border-[#087F72] focus:ring-2 focus:ring-[#087F72]/20">
            <option value="">Choose a source</option>
            {authorities.map((authority) => <option key={authority} value={authority}>{REGIMEN_AUTHORITY_LABELS[authority]}</option>)}
          </select>
        </label>
      ) : null}
      <div className="mt-6 grid gap-2 sm:grid-cols-2">
        <button type="button" onClick={onClose} disabled={saving} className="min-h-12 rounded-xl border border-slate-300 px-4 py-3 font-bold text-slate-700">Cancel</button>
        <button type="button" disabled={saving || !scheduleReady || !reorderUrlReady || Boolean(doseIssue && !doseConfirmed) || (sourceRequired && !instructionAuthority)} onClick={() => onSave(item, {
          dose: dose.trim() || null,
          timing: timing.trim() || null,
          ...(doseIssue ? { doseConfirmed } : {}),
          ...(!prescribedItem ? { brand: brand.trim() || null, reorderUrl: reorderUrl.trim() || null } : {}),
          ...(hasStructuredSchedule ? { schedule: scheduleDraftPayload(schedule) } : {}),
          ...(instructionAuthority ? { instructionAuthority } : {}),
        })} className="inline-flex min-h-12 items-center justify-center rounded-xl bg-[#087F72] px-4 py-3 font-bold text-white disabled:opacity-60">
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="mr-2 h-4 w-4" aria-hidden="true" />} Save record
        </button>
      </div>
    </DialogShell>
  );
}

function AddPrescribedItemDialog({ kind, onClose, onAdded }: { kind: "medication" | "hormone"; onClose: () => void; onAdded: (name: string, id: string) => Promise<void> }) {
  const [name, setName] = useState("");
  const [dose, setDose] = useState("");
  const [timing, setTiming] = useState("");
  const [schedule, setSchedule] = useState<ScheduleDraft>(() => scheduleDraft(null));
  const [purpose, setPurpose] = useState("");
  const [instructionAuthority, setInstructionAuthority] = useState<MedicationInstructionAuthority | "">("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const label = kind === "hormone" ? "hormone therapy" : "medication";

  async function addPrescribedItem() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/routine/${kind === "hormone" ? "hormones" : "medications"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          dose,
          timing,
          ...(schedule.cadence ? { schedule: scheduleDraftPayload(schedule) } : {}),
          purpose,
          instruction_authority: instructionAuthority,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.ok || !body?.item?.id) throw new Error(body?.error ?? `${kind}_add_failed`);
      await onAdded(name.trim(), body.item.id);
    } catch {
      setError(`We could not add that ${label}. Your routine is unchanged.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <DialogShell title={`Add a prescribed ${label}`} onClose={onClose}>
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
        Record only what you currently take based on your clinician, healthcare provider, or prescription label. This does not ask LVE360 to recommend a {label} or dose.
      </div>
      <RoutineCopilotPanel
        kind={kind}
        onApply={(proposal) => {
          if (proposal.name) setName(proposal.name);
          if (proposal.dose) setDose(proposal.dose);
          if (proposal.timing) setTiming(proposal.timing);
          if (proposal.schedule) setSchedule(scheduleDraft(proposal.schedule));
        }}
      />
      <label className="mt-5 block text-sm font-bold text-[#041B2D]">{kind === "hormone" ? "Hormone name" : "Medication name"}<input autoFocus value={name} onChange={(event) => setName(event.target.value)} maxLength={120} className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 px-4 py-3 font-normal outline-none focus:border-[#087F72] focus:ring-2 focus:ring-[#087F72]/20" placeholder={kind === "hormone" ? "For example, testosterone cypionate" : "For example, Zepbound"} /></label>
      <label className="mt-5 block text-sm font-bold text-[#041B2D]">Prescribed dose<input value={dose} onChange={(event) => setDose(event.target.value)} maxLength={120} className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 px-4 py-3 font-normal outline-none focus:border-[#087F72] focus:ring-2 focus:ring-[#087F72]/20" placeholder={kind === "hormone" ? "For example, 80 mg" : "For example, 10 mg / 0.5 mL"} /></label>
      <label className="mt-5 block text-sm font-bold text-[#041B2D]">Schedule<input value={timing} onChange={(event) => setTiming(event.target.value)} maxLength={160} className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 px-4 py-3 font-normal outline-none focus:border-[#087F72] focus:ring-2 focus:ring-[#087F72]/20" placeholder={kind === "hormone" ? "For example, Monday and Thursday evenings" : "For example, once weekly on Sunday"} /></label>
      <ScheduleEditor value={schedule} onChange={setSchedule} />
      <label className="mt-5 block text-sm font-bold text-[#041B2D]">Purpose you were given <span className="font-normal text-slate-500">(optional)</span><input value={purpose} onChange={(event) => setPurpose(event.target.value)} maxLength={200} className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 px-4 py-3 font-normal outline-none focus:border-[#087F72] focus:ring-2 focus:ring-[#087F72]/20" placeholder={kind === "hormone" ? "For example, hormone replacement" : "For example, weight management"} /></label>
      <label className="mt-5 block text-sm font-bold text-[#041B2D]">Where did this instruction come from?
        <select value={instructionAuthority} onChange={(event) => setInstructionAuthority(event.target.value as MedicationInstructionAuthority)} className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 font-normal outline-none focus:border-[#087F72] focus:ring-2 focus:ring-[#087F72]/20">
          <option value="">Choose a source</option>
          {MEDICATION_INSTRUCTION_AUTHORITIES.map((authority) => <option key={authority} value={authority}>{MEDICATION_AUTHORITY_LABELS[authority]}</option>)}
        </select>
      </label>
      {error ? <p className="mt-4 rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-800">{error}</p> : null}
      <div className="mt-6 grid gap-2 sm:grid-cols-2">
        <button type="button" onClick={onClose} disabled={busy} className="min-h-12 rounded-xl border border-slate-300 px-4 py-3 font-bold text-slate-700">Cancel</button>
        <button type="button" disabled={busy || !name.trim() || !instructionAuthority || (Boolean(schedule.cadence) && !scheduleDraftIsReady(schedule))} onClick={() => void addPrescribedItem()} className="inline-flex min-h-12 items-center justify-center rounded-xl bg-[#087F72] px-4 py-3 font-bold text-white disabled:opacity-60">
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="mr-2 h-4 w-4" aria-hidden="true" />} Add reported {label}
        </button>
      </div>
    </DialogShell>
  );
}

function AddSupplementDialog({ onClose, onAdded }: { onClose: () => void; onAdded: (name: string, id: string) => Promise<void> }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchItem[]>([]);
  const [searched, setSearched] = useState(false);
  const [manualName, setManualName] = useState("");
  const [manualBrand, setManualBrand] = useState("");
  const [manualDose, setManualDose] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function search() {
    setBusy(true); setError(null); setSearched(false);
    try {
      const response = await fetch(`/api/fullscript/search?q=${encodeURIComponent(query)}`, { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.ok) throw new Error("search_failed");
      setResults(body.items ?? []);
      setSearched(true);
    } catch { setError("We could not search the catalog right now."); }
    finally { setBusy(false); }
  }
  async function add(item: SearchItem, timing: "AM" | "PM" | "AM/PM") {
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/fullscript/add", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        name: item.name,
        dose: item.dose,
        timing,
        brand: item.brand,
        reorder_url: item.reorder_url,
        image_url: item.image_url,
        product_source: item.vendor,
        product_sku: item.sku,
      }) });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.ok || !body?.item?.id) throw new Error("add_failed");
      await onAdded(item.name, body.item.id);
    } catch { setError("We could not add that supplement. Your routine is unchanged."); }
    finally { setBusy(false); }
  }
  function addManual(timing: "AM" | "PM" | "AM/PM") {
    const name = manualName.trim();
    if (!name) return;
    return add({
      vendor: "member",
      sku: null,
      name,
      brand: manualBrand.trim() || null,
      dose: manualDose.trim() || null,
      link_fullscript: null,
      link_amazon: null,
      price: null,
      reorder_url: null,
      image_url: null,
    }, timing);
  }
  return (
    <DialogShell title="Add a supplement" onClose={onClose} wide>
      <p className="text-sm leading-6 text-slate-600">Search for a product, then record when you take it. Adding a product records your choice and is not an LVE360 recommendation.</p>
      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        <label className="sr-only" htmlFor="routine-product-search">Search supplements</label>
        <input autoFocus id="routine-product-search" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void search(); }} placeholder="Search supplements" className="min-h-12 flex-1 rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-[#087F72] focus:ring-2 focus:ring-[#087F72]/20" />
        <button type="button" disabled={busy || !query.trim()} onClick={() => void search()} className="inline-flex min-h-12 items-center justify-center rounded-xl bg-[#087F72] px-5 py-3 font-bold text-white disabled:opacity-60"><Search className="mr-2 h-5 w-5" aria-hidden="true" /> Search</button>
      </div>
      {error ? <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-900">{error}</p> : null}
      <div className="mt-5 max-h-[50vh] space-y-3 overflow-y-auto pr-1">
        {results.map((item, index) => <div key={item.sku ?? `${item.name}-${index}`} className="rounded-2xl border border-slate-200 p-4"><div className="flex items-start gap-4">{item.image_url ? <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-white"><Image src={item.image_url} alt={`${item.brand ? `${item.brand} ` : ""}${item.name} product`} fill sizes="80px" className="object-contain p-1.5" /></div> : <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl border border-dashed border-slate-300 text-slate-400"><PackageOpen className="h-8 w-8" aria-hidden="true" /></div>}<div><h3 className="font-bold text-[#041B2D]">{item.name}</h3><p className="mt-1 text-sm text-slate-600">{item.brand || "Brand not listed"}{item.dose ? `, ${item.dose}` : ""}</p></div></div><div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">{(["AM", "PM", "AM/PM"] as const).map((timing) => <button key={timing} type="button" disabled={busy} onClick={() => void add(item, timing)} className="inline-flex min-h-12 items-center justify-center rounded-xl border border-[#9DCFC3] px-3 py-3 font-bold text-[#06695F] hover:bg-[#EAFBF8] disabled:opacity-60">Add {timing}<ChevronRight className="ml-1 h-4 w-4" aria-hidden="true" /></button>)}</div></div>)}
        {!results.length && !busy ? <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">{searched ? "No catalog match was found. You can still record the supplement manually below." : "Search by supplement or ingredient name, or add it manually below."}</p> : null}

        <section className="rounded-2xl border border-[#BCE3DA] bg-[#F4FAF8] p-4" aria-labelledby="manual-supplement-heading">
          <h3 id="manual-supplement-heading" className="font-bold text-[#041B2D]">Add a supplement manually</h3>
          <p className="mt-1 text-sm leading-6 text-slate-600">Record what you already take even when the product catalog has no match. You can add exact timing, a link, and other details after saving.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-bold text-[#041B2D] sm:col-span-2">Supplement name<input value={manualName} onChange={(event) => setManualName(event.target.value)} maxLength={120} placeholder="For example, vitamin C" className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 font-normal outline-none focus:border-[#087F72] focus:ring-2 focus:ring-[#087F72]/20" /></label>
            <label className="text-sm font-bold text-[#041B2D]">Brand <span className="font-normal text-slate-500">(optional)</span><input value={manualBrand} onChange={(event) => setManualBrand(event.target.value)} maxLength={120} placeholder="For example, Thorne" className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 font-normal outline-none focus:border-[#087F72] focus:ring-2 focus:ring-[#087F72]/20" /></label>
            <label className="text-sm font-bold text-[#041B2D]">Amount <span className="font-normal text-slate-500">(optional)</span><input value={manualDose} onChange={(event) => setManualDose(event.target.value)} maxLength={120} placeholder="For example, 500 mg" className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 font-normal outline-none focus:border-[#087F72] focus:ring-2 focus:ring-[#087F72]/20" /></label>
          </div>
          <p className="mt-4 text-sm font-bold text-[#041B2D]">When do you usually take it?</p>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
            {([{"timing":"AM","label":"Add for morning"},{"timing":"PM","label":"Add for evening"},{"timing":"AM/PM","label":"Add morning and evening"}] as const).map(({ timing, label }) => (
              <button key={timing} type="button" disabled={busy || !manualName.trim()} onClick={() => void addManual(timing)} className="inline-flex min-h-12 items-center justify-center rounded-xl border border-[#087F72] bg-white px-3 py-3 font-bold text-[#06695F] hover:bg-[#EAFBF8] disabled:opacity-50">{label}<ChevronRight className="ml-1 h-4 w-4" aria-hidden="true" /></button>
            ))}
          </div>
        </section>
      </div>
    </DialogShell>
  );
}

function DialogShell({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return <div className="fixed inset-0 z-[65] flex items-center justify-center bg-[#041B2D]/55 p-4" role="dialog" aria-modal="true" aria-label={title}><div className={`max-h-[92vh] w-full overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl sm:p-6 ${wide ? "max-w-3xl" : "max-w-xl"}`}><div className="flex items-center justify-between gap-4"><h2 className="text-2xl font-bold text-[#041B2D]">{title}</h2><button type="button" onClick={onClose} className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087F72]" aria-label="Close dialog"><X className="h-6 w-6" aria-hidden="true" /></button></div><div className="mt-4">{children}</div></div></div>;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(value));
}

function isValidHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" && Boolean(url.hostname);
  } catch {
    return false;
  }
}
