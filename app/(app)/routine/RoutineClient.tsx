"use client";

import {
  AlertTriangle,
  Check,
  ChevronRight,
  CirclePlus,
  Clock3,
  ExternalLink,
  HeartPulse,
  Loader2,
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
import { useEffect, useMemo, useState } from "react";

import {
  groupRoutineItems,
  isClinicianReviewProposal,
  ROUTINE_SECTION_LABELS,
  ROUTINE_SECTION_ORDER,
  routineScheduleLabel,
  routineInstructionAuthorityLabel,
  routineSourceLabel,
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
import ScheduleEditor, {
  scheduleDraft,
  scheduleDraftIsReady,
  scheduleDraftPayload,
  type ScheduleDraft,
} from "./ScheduleEditor";
import TodayDoses from "./TodayDoses";

type LatestStack = { id: string; submission_id: string | null; created_at: string } | null;
type ToastState = { message: string; undo?: () => Promise<void> } | null;
type SearchItem = {
  vendor: "fullscript" | "fallback";
  sku: string | null;
  name: string;
  brand: string | null;
  dose: string | null;
  link_fullscript: string | null;
  link_amazon: string | null;
  price: number | null;
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
  const grouped = useMemo(() => groupRoutineItems(items), [items]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 7000);
    return () => window.clearTimeout(timer);
  }, [toast]);

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

  async function saveEdit(item: RoutineItem, patch: { dose?: string | null; schedule?: RoutineItem["schedule"]; instructionAuthority?: RegimenInstructionAuthority }) {
    setBusyId(item.id);
    const previous = { dose: item.dose, schedule: item.schedule ?? null, instructionAuthority: item.instruction_authority ?? undefined };
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
    if (isClinicianReviewProposal(item)) {
      const confirmed = window.confirm(
        "This item was flagged for clinician or pharmacist review. Only add it if you have already decided it belongs in your routine."
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

  return (
    <>
      <TodayDoses refreshToken={doseRefreshToken} />

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

      <div className="space-y-5">
        {ROUTINE_SECTION_ORDER.map((kind) => (
          <RoutineSection
            key={kind}
            kind={kind}
            items={grouped.byKind[kind]}
            busyId={busyId}
            onEdit={setEditing}
            onStop={stopTracking}
          />
        ))}
      </div>

      <IdeasSection items={grouped.proposals} busyId={busyId} onAdopt={adoptProposal} />

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
  const authorityLabel = routineInstructionAuthorityLabel(item.instruction_authority);
  return (
    <li className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg font-bold text-[#041B2D]">{item.name}</h3>
          <p className="mt-1 text-sm text-slate-600">{routineSourceLabel(item.instruction_source)}</p>
        </div>
        {busy ? <Loader2 className="h-5 w-5 animate-spin text-[#087F72]" aria-label="Saving" /> : null}
      </div>
      <dl className="mt-4 space-y-3 text-sm">
        <div>
          <dt className="font-bold text-[#041B2D]">{prescribedItem ? "Reported dose" : "Recorded amount"}</dt>
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
      {prescribedItem ? (
        <p className="mt-4 rounded-xl bg-white p-3 text-xs leading-5 text-slate-600">
          LVE360 records what you report. It does not select or recommend prescription doses. Follow your prescription label and clinician instructions.
        </p>
      ) : null}
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => onEdit(item)}
          className="inline-flex min-h-12 items-center justify-center rounded-xl border border-[#9DCFC3] bg-white px-4 py-3 font-bold text-[#06695F] hover:bg-[#EAFBF8] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087F72]"
        >
          <Pencil className="mr-2 h-4 w-4" aria-hidden="true" /> {prescribedItem ? "Record dose or schedule change" : "Edit dose or schedule"}
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

function IdeasSection({ items, busyId, onAdopt }: { items: RoutineItem[]; busyId: string | null; onAdopt: (item: RoutineItem) => void }) {
  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm sm:p-6" aria-labelledby="routine-ideas">
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
                <p className="mt-2 text-sm text-slate-700">{item.purpose || item.notes || "Review the evidence and safety context in your Blueprint."}</p>
                {clinicianReview ? <p className="mt-3 flex items-start rounded-xl bg-amber-100 p-3 text-sm font-semibold text-amber-900"><AlertTriangle className="mr-2 mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> Clinician or pharmacist review is recommended before adding this.</p> : null}
                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    disabled={busyId === item.id}
                    onClick={() => void onAdopt(item)}
                    className="inline-flex min-h-12 flex-1 items-center justify-center rounded-xl bg-[#087F72] px-4 py-3 font-bold text-white hover:bg-[#06695F] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087F72] focus-visible:ring-offset-2"
                  >
                    {busyId === item.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="mr-2 h-4 w-4" aria-hidden="true" />}
                    {clinicianReview ? "Add after review" : "Add to current routine"}
                  </button>
                  {link ? <a href={link} target="_blank" rel="noopener noreferrer nofollow sponsored" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-amber-300 px-4 py-3 font-bold text-amber-900 hover:bg-amber-100"><ExternalLink className="mr-2 h-4 w-4" aria-hidden="true" /> Product info</a> : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : <p className="mt-5 rounded-xl bg-white p-4 text-sm text-slate-600">No new Blueprint ideas are waiting for review.</p>}
    </section>
  );
}

function EditRoutineDialog({ item, saving, onClose, onSave }: { item: RoutineItem; saving: boolean; onClose: () => void; onSave: (item: RoutineItem, patch: { dose?: string | null; schedule?: RoutineItem["schedule"]; instructionAuthority?: RegimenInstructionAuthority }) => void }) {
  const prescribedItem = item.item_kind === "medication" || item.item_kind === "hormone";
  const [dose, setDose] = useState(item.dose ?? "");
  const [schedule, setSchedule] = useState<ScheduleDraft>(() => scheduleDraft(item.schedule));
  const [instructionAuthority, setInstructionAuthority] = useState<RegimenInstructionAuthority | "">(
    item.instruction_authority ?? ""
  );
  const authorities = prescribedItem
    ? MEDICATION_INSTRUCTION_AUTHORITIES
    : REGIMEN_INSTRUCTION_AUTHORITIES.filter((authority) => authority !== "medication_label");
  const hasStructuredSchedule = Boolean(schedule.cadence);
  const scheduleReady = !hasStructuredSchedule || scheduleDraftIsReady(schedule);
  const sourceRequired = prescribedItem || hasStructuredSchedule;
  return (
    <DialogShell title={prescribedItem ? `Record a prescribed change for ${item.name}` : `Update ${item.name}`} onClose={onClose}>
      <p className="text-sm leading-6 text-slate-600">
        {prescribedItem
          ? "Use this only to record a change you received from your clinician, pharmacist, or current prescription label. LVE360 is not changing or recommending your prescription."
          : "Record what you currently do. This does not create a medical instruction or replace a product label."}
      </p>
      <label className="mt-5 block text-sm font-bold text-[#041B2D]">{prescribedItem ? "Prescribed dose" : "Amount you take"}<input autoFocus value={dose} onChange={(event) => setDose(event.target.value)} maxLength={120} className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 px-4 py-3 font-normal outline-none focus:border-[#087F72] focus:ring-2 focus:ring-[#087F72]/20" placeholder={item.item_kind === "hormone" ? "For example, 80 mg" : "For example, 2 capsules"} /></label>
      {!item.schedule && item.timing ? <p className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-700"><span className="font-bold">Current written schedule:</span> {item.timing}. Choose a structured cadence below to use the daily checklist.</p> : null}
      <ScheduleEditor value={schedule} onChange={setSchedule} />
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
        <button type="button" disabled={saving || !scheduleReady || (sourceRequired && !instructionAuthority)} onClick={() => onSave(item, {
          dose: dose.trim() || null,
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
        Record only what you currently take based on your clinician, pharmacist, or prescription label. This does not ask LVE360 to recommend a {label} or dose.
      </div>
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function search() {
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/fullscript/search?q=${encodeURIComponent(query)}`, { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.ok) throw new Error("search_failed");
      setResults(body.items ?? []);
    } catch { setError("We could not search the catalog right now."); }
    finally { setBusy(false); }
  }
  async function add(item: SearchItem, timing: "AM" | "PM" | "AM/PM") {
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/fullscript/add", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: item.name, dose: item.dose, timing }) });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.ok || !body?.item?.id) throw new Error("add_failed");
      await onAdded(item.name, body.item.id);
    } catch { setError("We could not add that supplement. Your routine is unchanged."); }
    finally { setBusy(false); }
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
        {results.map((item, index) => <div key={item.sku ?? `${item.name}-${index}`} className="rounded-2xl border border-slate-200 p-4"><h3 className="font-bold text-[#041B2D]">{item.name}</h3><p className="mt-1 text-sm text-slate-600">{item.brand || "Brand not listed"}{item.dose ? `, ${item.dose}` : ""}</p><div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">{(["AM", "PM", "AM/PM"] as const).map((timing) => <button key={timing} type="button" disabled={busy} onClick={() => void add(item, timing)} className="inline-flex min-h-12 items-center justify-center rounded-xl border border-[#9DCFC3] px-3 py-3 font-bold text-[#06695F] hover:bg-[#EAFBF8] disabled:opacity-60">Add {timing}<ChevronRight className="ml-1 h-4 w-4" aria-hidden="true" /></button>)}</div></div>)}
        {!results.length && !busy ? <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">Search by supplement or ingredient name.</p> : null}
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
