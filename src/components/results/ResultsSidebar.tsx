"use client";
import { useEffect, useMemo, useState } from "react";

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

export default function ResultsSidebar({ stackId }: { stackId: string }) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // --- fetch items for this stack ------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    const ac = new AbortController();

    (async () => {
      try {
        setLoading(true);
        setError(null);
        const r = await fetch(
          `/api/stack-items?stack_id=${encodeURIComponent(stackId)}`,
          { cache: "no-store", signal: ac.signal }
        );
        const j = await r.json();
        if (!cancelled) {
          setItems(Array.isArray(j?.items) ? j.items : []);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setError("Couldn’t load stack items.");
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [stackId]);

  // --- helpers ------------------------------------------------------------------
  // Local classifier (used if timing_bucket isn't provided by API)
  function classify(text?: string | null): "AM" | "PM" | "AM/PM" | "Anytime" {
    if (!text) return "Anytime";
    const s = text.toLowerCase();
    const am = /\b(am|morning|breakfast)\b/.test(s);
    const pm = /\b(pm|evening|night|bedtime)\b/.test(s);
    if (am && pm) return "AM/PM";
    if (/\b(bid|twice|2x|am\/pm|split)\b/.test(s)) return "AM/PM";
    if (am) return "AM";
    if (pm) return "PM";
    if (/\bwith (meal|meals|food)\b/.test(s)) return "Anytime";
    return "Anytime";
  }

  const amazonTag = process.env.NEXT_PUBLIC_AMAZON_TAG || "";
  const fallbackAmazon = (name: string) =>
    `https://www.amazon.com/s?k=${encodeURIComponent(
      `${name} supplement`
    )}` + (amazonTag ? `&tag=${encodeURIComponent(amazonTag)}` : "");

  // Click tracking via /api/r (server will decode + 302)
  const track = (
    url: string,
    src: "amazon" | "fullscript",
    itemName: string
  ) =>
    `/api/r?u=${encodeURIComponent(url)}&src=${src}` +
    `&stack_id=${encodeURIComponent(stackId)}` +
    `&item=${encodeURIComponent(itemName)}`;

  // --- bucket items --------------------------------------------------------------
  const { both, am, pm, any } = useMemo(() => {
    const BOTH: Item[] = [];
    const AM: Item[] = [];
    const PM: Item[] = [];
    const ANY: Item[] = [];

    for (const i of items) {
      const bucket =
        (i.timing_bucket as Item["timing_bucket"]) ??
        classify(i.timing_text ?? i.timing ?? null);

      if (bucket === "AM/PM") BOTH.push(i);
      else if (bucket === "AM") AM.push(i);
      else if (bucket === "PM") PM.push(i);
      else ANY.push(i);
    }
    return { both: BOTH, am: AM, pm: PM, any: ANY };
  }, [items]);

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
