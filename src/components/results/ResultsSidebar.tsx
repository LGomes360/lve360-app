"use client";
import { useEffect, useMemo, useState } from "react";
import { bucketsFromRecord } from "@/src/lib/timing";

type Item = {
  id: string;
  name: string;
  dose?: string | null;
  timing?: string | null;           // normalized (optional)
  timing_text?: string | null;      // original free-text (optional)
  timing_bucket?: "AM" | "PM" | "AM/PM" | "Anytime" | null;
  is_current?: boolean | null;
  link_amazon?: string | null;
  link_fullscript?: string | null;
};

type Filter = "all" | "current" | "recommended";

export default function ResultsSidebar({ stackId }: { stackId: string }) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  // --- fetch items for this stack ------------------------------------------------
useEffect(() => {
  let cancelled = false;
  const ac = new AbortController();

  (async () => {
    try {
      setLoading(true);
      setError(null);

      // NEW: merged current + latest blueprint, de-duped
      const r = await fetch("/api/stacks/combined", { cache: "no-store", signal: ac.signal });
      const j = await r.json();
      if (!cancelled) {
        setItems(Array.isArray(j?.items) ? j.items : []);
        setLoading(false);
      }
    } catch {
      if (!cancelled) {
        setError("Couldn’t load items.");
        setLoading(false);
      }
    }
  })();

  return () => {
    cancelled = true;
    ac.abort();
  };
}, []); // ← no stackId dependency; we’re using merged endpoint


  // --- helpers ------------------------------------------------------------------
const { both, am, pm, any } = useMemo(() => {
  const BOTH: Item[] = [];
  const AM: Item[] = [];
  const PM: Item[] = [];
  const ANY: Item[] = [];

  for (const i of filtered) {
    // bucketsFromRecord will look at timing_bucket first, then timing/timing_text
    const buckets = bucketsFromRecord({
      timing: i.timing ?? i.timing_text ?? null,
      timing_bucket: i.timing_bucket ?? null,
    });

    if (buckets.includes("AM") && buckets.includes("PM")) BOTH.push(i);
    else if (buckets.includes("AM")) AM.push(i);
    else if (buckets.includes("PM")) PM.push(i);
    else ANY.push(i);
  }
  return { both: BOTH, am: AM, pm: PM, any: ANY };
}, [filtered]);


  const amazonTag = process.env.NEXT_PUBLIC_AMAZON_TAG || "";
  const fallbackAmazon = (name: string) =>
    `https://www.amazon.com/s?k=${encodeURIComponent(
      `${name} supplement`
    )}` + (amazonTag ? `&tag=${encodeURIComponent(amazonTag)}` : "");

  const track = (
    url: string,
    src: "amazon" | "fullscript",
    itemName: string
  ) =>
    `/api/r?u=${encodeURIComponent(url)}&src=${src}` +
    `&stack_id=${encodeURIComponent(stackId)}` +
    `&item=${encodeURIComponent(itemName)}`;

  // counts for tabs
  const counts = useMemo(() => {
    const current = items.filter((i) => Boolean(i.is_current)).length;
    const recommended = items.filter((i) => !i.is_current).length;
    return { all: items.length, current, recommended };
  }, [items]);

  // filter then bucket
  const filtered = useMemo(() => {
    if (filter === "current") return items.filter((i) => Boolean(i.is_current));
    if (filter === "recommended") return items.filter((i) => !i.is_current);
    return items;
  }, [items, filter]);

  const { both, am, pm, any } = useMemo(() => {
    const BOTH: Item[] = [];
    const AM: Item[] = [];
    const PM: Item[] = [];
    const ANY: Item[] = [];
    for (const i of filtered) {
      const bucket =
        (i.timing_bucket as Item["timing_bucket"]) ??
        classify(i.timing_text ?? i.timing ?? null);

      if (bucket === "AM/PM") BOTH.push(i);
      else if (bucket === "AM") AM.push(i);
      else if (bucket === "PM") PM.push(i);
      else ANY.push(i);
    }
    return { both: BOTH, am: AM, pm: PM, any: ANY };
  }, [filtered]);

  // --- UI guards ----------------------------------------------------------------
  if (loading || items.length === 0) return null;

  // Row renderer (dose + “Current” badge + links)
  const ItemRow = (i: Item) => {
    const amazonUrl = i.link_amazon || fallbackAmazon(i.name);
    return (
      <li key={i.id} className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm truncate">
            {i.name}
            {i.is_current ? (
              <span className="ml-1 align-middle text-[10px] px-1 py-0.5 rounded bg-emerald-100 text-emerald-700">
                Current
              </span>
            ) : null}
          </div>
          {i.dose ? (
            <div className="text-xs text-zinc-500 truncate">{i.dose}</div>
          ) : null}
        </div>
        <div className="flex gap-2 shrink-0">
          {i.link_fullscript ? (
            <a
              href={track(i.link_fullscript, "fullscript", i.name)}
              className="text-xs underline"
              target="_blank"
              rel="noopener noreferrer nofollow"
            >
              Fullscript
            </a>
          ) : null}
          <a
            href={track(amazonUrl, "amazon", i.name)}
            className="text-xs underline"
            target="_blank"
            rel="noopener noreferrer nofollow"
          >
            Amazon
          </a>
        </div>
      </li>
    );
  };

  // --- render -------------------------------------------------------------------
  return (
    <aside className="sticky top-4 space-y-6">
      {error && <div className="text-sm text-red-600">{error}</div>}

      {/* Filter toggle */}
      <div
        role="tablist"
        aria-label="Filter items"
        className="flex w-full rounded-lg bg-zinc-100 p-1 text-xs"
      >
        {(["all", "current", "recommended"] as Filter[]).map((key) => {
          const active = filter === key;
          const label =
            key === "all"
              ? `All (${counts.all})`
              : key === "current"
              ? `Current (${counts.current})`
              : `Recommended (${counts.recommended})`;
          return (
            <button
              key={key}
              role="tab"
              aria-selected={active}
              onClick={() => setFilter(key)}
              className={
                "flex-1 rounded-md px-2 py-1 transition " +
                (active
                  ? "bg-white shadow text-zinc-900"
                  : "text-zinc-600 hover:text-zinc-900")
              }
            >
              {label}
            </button>
          );
        })}
      </div>

      <p className="text-xs text-zinc-500">Tap a link to shop</p>

      {both.length > 0 && (
        <section>
          <h3 className="font-semibold mb-2">AM / PM</h3>
          <ul className="space-y-1">{both.map(ItemRow)}</ul>
        </section>
      )}

      {am.length > 0 && (
        <section>
          <h3 className="font-semibold mb-2">AM</h3>
          <ul className="space-y-1">{am.map(ItemRow)}</ul>
        </section>
      )}

      {pm.length > 0 && (
        <section>
          <h3 className="font-semibold mb-2">PM</h3>
          <ul className="space-y-1">{pm.map(ItemRow)}</ul>
        </section>
      )}

      {any.length > 0 && (
        <section>
          <h3 className="font-semibold mb-2">Anytime</h3>
          <ul className="space-y-1">{any.map(ItemRow)}</ul>
        </section>
      )}
    </aside>
  );
}
