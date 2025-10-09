"use client";

import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { CheckCircle2, Circle, TriangleAlert, PackageOpen, Pill, Search } from "lucide-react";

type StackRow = { id: string; created_at: string };
type StackItem = {
  id: string;
  stack_id: string;
  name: string;
  brand: string | null;
  dose: string | null;
  timing: "AM" | "PM" | "AM/PM" | (string & {}) | null;
  notes: string | null;
  link_amazon: string | null;
  link_fullscript: string | null;
  refill_days_left: number | null;
  last_refilled_at: string | null;
};
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

export default function TodaysPlan() {
  const supabase = createClientComponentClient();
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [stack, setStack] = useState<StackRow | null>(null);
  const [items, setItems] = useState<StackItem[]>([]);
  const [showManager, setShowManager] = useState(false);

  // DB persisted "taken today" statuses
  const [takenMap, setTakenMap] = useState<Record<string, boolean>>({});
  const today = new Date().toISOString().slice(0, 10);

  // Local fallback key (only if API fails)
  const localKey = useMemo(() => {
    if (!userId) return null;
    return `lve360_taken_${userId}_${today}`;
  }, [userId, today]);

  // Fetch latest stack + items + today statuses
  useEffect(() => {
    (async () => {
      const { data: userWrap } = await supabase.auth.getUser();
      const uid = userWrap?.user?.id ?? null;
      setUserId(uid);

      if (!uid) {
        setLoading(false);
        return;
      }

      const { data: stacksRows } = await supabase
        .from("stacks")
        .select("id, created_at")
        .eq("user_id", uid)
        .order("created_at", { ascending: false })
        .limit(1);

      const latest = (stacksRows?.[0] ?? null) as StackRow | null;
      setStack(latest);

      if (latest?.id) {
        const { data: itemRows } = await supabase
          .from("stacks_items")
          .select("id, stack_id, name, brand, dose, timing, notes, link_amazon, link_fullscript, refill_days_left, last_refilled_at")
          .eq("stack_id", latest.id)
          .order("created_at", { ascending: true });
        const arr = (itemRows ?? []) as StackItem[];
        setItems(arr);

        // Load today's statuses from API
        try {
          const res = await fetch(`/api/intake/status?stack_id=${latest.id}`, { cache: "no-store" });
          const json = await res.json();
          if (json?.ok) {
            setTakenMap(json.statuses || {});
            if (localKey) localStorage.setItem(localKey, JSON.stringify(json.statuses || {}));
          } else {
            if (localKey) {
              const raw = localStorage.getItem(localKey);
              setTakenMap(raw ? JSON.parse(raw) : {});
            }
          }
        } catch {
          if (localKey) {
            const raw = localStorage.getItem(localKey);
            setTakenMap(raw ? JSON.parse(raw) : {});
          }
        }
      }

      setLoading(false);
    })();
  }, [supabase, localKey]);

  // Toggle an item (persist to DB; fallback to local)
  async function toggleTaken(itemId: string) {
    const nextVal = !takenMap[itemId];

    try {
      const res = await fetch("/api/intake/set", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: itemId, taken: nextVal }),
      });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error || "set_failed");

      setTakenMap((prev) => {
        const next = { ...prev, [itemId]: nextVal };
        if (localKey) localStorage.setItem(localKey, JSON.stringify(next));
        return next;
      });
    } catch {
      // Fallback to local only if DB write fails
      setTakenMap((prev) => {
        const next = { ...prev, [itemId]: nextVal };
        if (localKey) localStorage.setItem(localKey, JSON.stringify(next));
        return next;
      });
    }
  }// Mark all items for today as taken (true) or not (false)
async function markAll(taken: boolean) {
  const ids = items.map(i => i.id);
  if (ids.length === 0) return;

  // Fire-and-forget to the API (we update UI regardless, then rely on retries later)
  await Promise.allSettled(
    ids.map(id =>
      fetch("/api/intake/set", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: id, taken }),
      })
    )
  );

  // Update local UI + localStorage fallback
  setTakenMap(() => {
    const next: Record<string, boolean> = {};
    ids.forEach(id => (next[id] = taken));
    if (localKey) localStorage.setItem(localKey, JSON.stringify(next));
    return next;
  });
}

  // Split by timing
  const itemsAM = items.filter((i) => (i.timing ?? "").includes("AM"));
  const itemsPM = items.filter((i) => (i.timing ?? "").includes("PM"));
  const itemsOther = items.filter(
    (i) => !i.timing || (i.timing !== "AM" && i.timing !== "PM" && i.timing !== "AM/PM")
  );

  // Completion %
  const completion = useMemo(() => {
    const ids = items.map((i) => i.id);
    const total = ids.length || 1;
    const done = ids.reduce((acc, id) => acc + (takenMap[id] ? 1 : 0), 0);
    return Math.round((done / total) * 100);
  }, [items, takenMap]);

  // Reload items helper (after adding new)
  async function reloadItems() {
    if (!stack?.id) return;
    const { data: itemRows } = await supabase
      .from("stacks_items")
      .select("id, stack_id, name, brand, dose, timing, notes, link_amazon, link_fullscript, refill_days_left, last_refilled_at")
      .eq("stack_id", stack.id)
      .order("created_at", { ascending: true });
    setItems((itemRows ?? []) as StackItem[]);
    // Refresh statuses too
    try {
      const res = await fetch(`/api/intake/status?stack_id=${stack.id}`, { cache: "no-store" });
      const json = await res.json();
      if (json?.ok) {
        setTakenMap(json.statuses || {});
        if (localKey) localStorage.setItem(localKey, JSON.stringify(json.statuses || {}));
      }
    } catch {}
  }

  if (loading) {
    return (
      <div id="todays-plan" className="bg-white/70 backdrop-blur-md rounded-2xl p-6 shadow-sm">
        <div className="flex items-center text-gray-600">
          <Pill className="w-5 h-5 mr-2 text-purple-600" />
          Loading your plan…
        </div>
      </div>
    );
  }

  return (
    <div id="todays-plan" className="bg-white/70 backdrop-blur-md rounded-2xl p-6 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-4">
        <div>
          <h2 className="text-2xl font-bold text-[#041B2D]">🗓️ Today’s Plan</h2>
          <p className="text-gray-600">
            Your latest stack{stack?.created_at ? ` • generated ${new Date(stack.created_at).toLocaleDateString()}` : ""}.
          </p>
        </div>
        <div className="text-sm text-gray-700">
          Completion today:{" "}
          <button
            onClick={() => {
              const allIds = items.map(i => i.id);
              const allTaken = allIds.every(id => takenMap[id]);
              // flip all
              Promise.all(
                allIds.map(id =>
                  fetch("/api/intake/set", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ item_id: id, taken: !allTaken }),
                  })
                )
              ).finally(() => {
                const next: Record<string, boolean> = {};
                allIds.forEach(id => (next[id] = !allTaken));
                setTakenMap(next);
              });
            }}
            className="font-semibold text-[#06C1A0] underline underline-offset-2"
            title="Toggle all items"
          >
            {completion}%
          </button>
        </div>

      </div>

      <TimingBlock title="AM Routine" items={itemsAM} takenMap={takenMap} onToggle={toggleTaken} />
      <div className="mt-5">
        <TimingBlock title="PM Routine" items={itemsPM} takenMap={takenMap} onToggle={toggleTaken} />
      </div>
      {itemsOther.length > 0 && (
        <div className="mt-5">
          <TimingBlock title="Other / Unspecified" items={itemsOther} takenMap={takenMap} onToggle={toggleTaken} />
        </div>
      )}

      {/* Manage & Refill */}
      <div className="mt-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <LowStockBanner items={items} />
        <div className="flex gap-2">
          <button
            onClick={() => setShowManager(true)}
            className="inline-flex items-center rounded-xl bg-gradient-to-r from-[#06C1A0] to-[#7C3AED] px-4 py-2 text-white font-semibold shadow-md"
          >
            <Search className="w-4 h-4 mr-2" />
            Manage Stack
          </button>
        </div>
      </div>

      {/* Stack Manager Modal (search + add) */}
      {showManager && (
        <StackManagerModal
          onClose={() => setShowManager(false)}
          onAdded={async () => {
            await reloadItems();
            setShowManager(false);
          }}
        />
      )}
    </div>
  );
}

/* ---------- Modal (search + add) ---------- */
function StackManagerModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<SearchItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function doSearch() {
    try {
      setBusy(true);
      setError(null);
      const res = await fetch(`/api/fullscript/search?q=${encodeURIComponent(q)}`, { cache: "no-store" });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error || "search_failed");
      setItems(json.items || []);
    } catch (e: any) {
      setError(e?.message ?? "Search failed");
      setItems([]);
    } finally {
      setBusy(false);
    }
  }

  async function addToStack(it: SearchItem, timing: "AM" | "PM" | "AM/PM") {
    try {
      setBusy(true);
      setError(null);
      const res = await fetch("/api/fullscript/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: it.name,
          brand: it.brand,
          dose: it.dose,
          link_fullscript: it.link_fullscript,
          link_amazon: it.link_amazon,
          source: it.vendor === "fullscript" ? "fullscript" : "amazon",
          sku: it.sku,
          timing,
          notes: null,
        }),
      });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error || "add_failed");
      await onAdded();
    } catch (e: any) {
      setError(e?.message ?? "Add failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-semibold text-[#041B2D]">Manage Your Stack</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700" aria-label="Close">✕</button>
        </div>

        <div className="flex gap-2">
          <input
            className="flex-1 rounded-lg border px-3 py-2"
            placeholder="Search Fullscript (or fallback catalog)…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && doSearch()}
          />
          <button
            onClick={doSearch}
            disabled={busy || !q.trim()}
            className="rounded-lg border px-4 py-2 font-medium hover:bg-white disabled:opacity-60"
          >
            {busy ? "Searching…" : "Search"}
          </button>
        </div>

        {error && (
          <div className="mt-3 text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
            {error}
          </div>
        )}

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[50vh] overflow-auto pr-1">
          {items.map((it, idx) => (
            <div key={`${it.sku ?? idx}`} className="rounded-xl border border-purple-100 bg-gradient-to-br from-purple-50 to-yellow-50 p-4">
              <div className="font-semibold text-[#041B2D]">{it.name}</div>
              <div className="text-sm text-gray-700">{it.brand ?? "—"}</div>
              <div className="text-xs text-gray-600">{it.dose ?? ""}</div>
              <div className="text-xs text-gray-500 mt-1">
                {it.price != null ? `~$${Number(it.price).toFixed(2)}` : ""}
              </div>
              <div className="mt-3 flex gap-2">
                <button onClick={() => addToStack(it, "AM")} className="rounded-lg border px-3 py-1.5 text-sm hover:bg-white">Add to AM</button>
                <button onClick={() => addToStack(it, "PM")} className="rounded-lg border px-3 py-1.5 text-sm hover:bg-white">Add to PM</button>
                <button onClick={() => addToStack(it, "AM/PM")} className="rounded-lg border px-3 py-1.5 text-sm hover:bg-white">Add AM/PM</button>
              </div>
            </div>
          ))}
          {items.length === 0 && !error && (
            <div className="text-gray-600">Try searching for “magnesium”, “omega”, “ashwagandha”…</div>
          )}
        </div>

        <div className="mt-4 text-right">
          <button onClick={onClose} className="rounded-lg border px-4 py-2 text-sm">Close</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Low stock banner ---------- */
function LowStockBanner({ items }: { items: StackItem[] }) {
  const low = items.filter((i) => (i.refill_days_left ?? Infinity) <= 10);
  if (!low.length) return null;
  return (
    <div className="inline-flex items-center gap-2 text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
      <TriangleAlert className="w-4 h-4" />
      {low.length} item{low.length > 1 ? "s" : ""} low — consider reordering.
    </div>
  );
}

/* ---------- Timing block ---------- */
function TimingBlock({
  title,
  items,
  takenMap,
  onToggle,
}: {
  title: string;
  items: StackItem[];
  takenMap: Record<string, boolean>;
  onToggle: (id: string) => void;
}) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-purple-600 mb-2">{title}</div>
      {items.length === 0 ? (
        <div className="rounded-xl border border-purple-100 bg-gradient-to-br from-purple-50 to-yellow-50 p-4 text-gray-600">
          No items in this timing.
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((it) => {
            const taken = !!takenMap[it.id];
            const link = it.link_fullscript || it.link_amazon || null;
            const low = (it.refill_days_left ?? Infinity) <= 10;
            return (
              <li
                key={it.id}
                className="rounded-xl border border-purple-100 bg-gradient-to-br from-purple-50 to-yellow-50 p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <button
                      onClick={() => onToggle(it.id)}
                      className="mt-0.5 text-[#7C3AED]"
                      aria-label={taken ? "Mark not taken" : "Mark taken"}
                      title={taken ? "Mark not taken" : "Mark taken"}
                    >
                      {taken ? <CheckCircle2 className="w-5 h-5" /> : <Circle className="w-5 h-5" />}
                    </button>
                    <div>
                      <div className="font-semibold text-[#041B2D]">
                        {it.name}{it.brand ? ` — ${it.brand}` : ""}
                      </div>
                      <div className="text-sm text-gray-700">
                        {(it.dose || "Dose not set").replace(/\*\*/g, "")}
                        {it.timing && !["AM", "PM", "AM/PM"].includes(it.timing) ? ` • ${it.timing}` : ""}
                      </div>
                      {it.notes && (
                      <div
                        className="text-xs text-gray-600 mt-0.5 line-clamp-2"
                        title={it.notes}
                      >
                        {it.notes}
                      </div>
                    )}
                      {low && (
                        <div className="mt-1 inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                          <TriangleAlert className="w-3 h-3" /> Refill soon
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {link ? (
                      <a
                        className="inline-flex items-center rounded-lg border px-3 py-1.5 text-sm hover:bg-white"
                        href={link}
                        target="_blank"
                        rel="noopener noreferrer nofollow sponsored"
                        title="Reorder"
                      >
                        <PackageOpen className="w-4 h-4 mr-1" />
                        Reorder
                      </a>
                    ) : (
                      <span className="text-xs text-gray-500">No link</span>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
