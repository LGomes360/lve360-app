"use client";

import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { CheckCircle2, Circle, TriangleAlert, PackageOpen, Pill, Search } from "lucide-react";

/**
 * Today’s Plan (Section 2)
 * - Loads latest user stack + items
 * - Splits by timing (AM, PM, AM/PM fallback → shows in both with suffix)
 * - Lets user mark “Taken” for TODAY (localStorage for now)
 * - Shows refill warnings (refill_days_left <= 10)
 * - Reorder button prefers Fullscript link; falls back to Amazon
 * - Manage Stack (modal stub) to be wired to Fullscript search next
 *
 * Tables used:
 *   - public.stacks (id, user_id, created_at, ...)
 *   - public.stacks_items (stack_id, name, dose, timing, link_fullscript, link_amazon, refill_days_left, last_refilled_at)
 */

type StackRow = { id: string; created_at: string };
type StackItem = {
  id: string;
  stack_id: string;
  name: string;
  brand: string | null;
  dose: string | null;
  timing: string | null; // 'AM' | 'PM' | 'AM/PM' | null
  notes: string | null;
  link_amazon: string | null;
  link_fullscript: string | null;
  refill_days_left: number | null;
  last_refilled_at: string | null;
};

export default function TodaysPlan() {
  const supabase = createClientComponentClient();
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [stack, setStack] = useState<StackRow | null>(null);
  const [items, setItems] = useState<StackItem[]>([]);
  const [showManager, setShowManager] = useState(false);

  // 1) Get user + latest stack
  useEffect(() => {
    (async () => {
      const { data: userWrap } = await supabase.auth.getUser();
      const uid = userWrap?.user?.id ?? null;
      setUserId(uid);

      if (!uid) {
        setLoading(false);
        return;
      }

      // Latest stack for this user
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
        setItems((itemRows ?? []) as StackItem[]);
      }

      setLoading(false);
    })();
  }, [supabase]);

  // 2) Local “Taken Today” state (persist per user+date+item)
  const todayKey = useMemo(() => {
    if (!userId) return null;
    const y = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    return `lve360_taken_${userId}_${y}`;
  }, [userId]);

  const [takenMap, setTakenMap] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (!todayKey) return;
    try {
      const raw = localStorage.getItem(todayKey);
      setTakenMap(raw ? JSON.parse(raw) : {});
    } catch {
      setTakenMap({});
    }
  }, [todayKey]);

  function toggleTaken(itemId: string) {
    if (!todayKey) return;
    setTakenMap((prev) => {
      const next = { ...prev, [itemId]: !prev[itemId] };
      localStorage.setItem(todayKey, JSON.stringify(next));
      return next;
    });
  }

  // 3) Split items by timing
  const itemsAM = items.filter((i) => (i.timing ?? "").includes("AM"));
  const itemsPM = items.filter((i) => (i.timing ?? "").includes("PM"));
  const itemsOther = items.filter((i) => !i.timing || (i.timing !== "AM" && i.timing !== "PM" && i.timing !== "AM/PM"));

  // 4) Completion %
  const completion = useMemo(() => {
    const ids = items.map((i) => i.id);
    const total = ids.length || 1;
    const done = ids.reduce((acc, id) => acc + (takenMap[id] ? 1 : 0), 0);
    return Math.round((done / total) * 100);
  }, [items, takenMap]);

  if (loading) {
    return (
      <div className="bg-white/70 backdrop-blur-md rounded-2xl p-6 shadow-sm">
        <div className="flex items-center text-gray-600">
          <Pill className="w-5 h-5 mr-2 text-purple-600" />
          Loading your plan…
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white/70 backdrop-blur-md rounded-2xl p-6 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-4">
        <div>
          <h2 className="text-2xl font-bold text-[#041B2D]">🗓️ Today’s Plan</h2>
          <p className="text-gray-600">
            Your latest stack{stack?.created_at ? ` • generated ${new Date(stack.created_at).toLocaleDateString()}` : ""}.
          </p>
        </div>
        <div className="text-sm text-gray-700">
          Completion today: <span className="font-semibold text-[#06C1A0]">{completion}%</span>
        </div>
      </div>

      {/* AM */}
      <TimingBlock title="AM Routine" items={itemsAM} takenMap={takenMap} onToggle={toggleTaken} />

      {/* PM */}
      <div className="mt-5">
        <TimingBlock title="PM Routine" items={itemsPM} takenMap={takenMap} onToggle={toggleTaken} />
      </div>

      {/* Other / Unspecified */}
      {itemsOther.length > 0 && (
        <div className="mt-5">
          <TimingBlock title="Other / Unspecified" items={itemsOther} takenMap={takenMap} onToggle={toggleTaken} />
        </div>
      )}

      {/* Manage & Refill section */}
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

      {/* Modal stub (we’ll wire this to Fullscript search next) */}
      {showManager && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold text-[#041B2D]">Manage Your Stack</h3>
              <button
                onClick={() => setShowManager(false)}
                className="text-gray-500 hover:text-gray-700"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <p className="text-gray-600 mb-4">
              Search Fullscript and add items here. (Next step.)
            </p>
            <div className="rounded-lg border border-dashed p-4 text-gray-500">
              🔧 Coming next: <code>/api/fullscript/search</code> &raquo; results &raquo; “Add to My Stack”
            </div>
            <div className="mt-4 text-right">
              <button
                onClick={() => setShowManager(false)}
                className="rounded-lg border px-4 py-2 text-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* --- Timing block (list) --- */
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
                        {it.dose || "Dose not set"}{it.timing && it.timing !== "AM" && it.timing !== "PM" ? ` • ${it.timing}` : ""}
                      </div>
                      {it.notes && <div className="text-xs text-gray-600 mt-0.5">{it.notes}</div>}
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
                        rel="noopener noreferrer"
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

/* --- End --- */
