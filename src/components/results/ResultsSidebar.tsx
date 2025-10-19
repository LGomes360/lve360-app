"use client";
import { useEffect, useMemo, useState } from "react";

type Item = {
  id: string;
  name: string;
  timing: string | null;
  link_amazon?: string | null;
  link_fullscript?: string | null;
};

export default function ResultsSidebar({ stackId }: { stackId: string }) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const ac = new AbortController();

    (async () => {
      try {
        setLoading(true);
        setError(null);
        const r = await fetch(`/api/stack-items?stack_id=${encodeURIComponent(stackId)}`, {
          cache: "no-store",
          signal: ac.signal,
        });
        const j = await r.json();
        if (!cancelled) {
          setItems(Array.isArray(j?.items) ? j.items : []);
          setLoading(false);
        }
      } catch (e) {
        if (!cancelled) {
          setError("Couldn’t load stack items.");
          setLoading(false);
        }
      }
    })();

    return () => { cancelled = true; ac.abort(); };
  }, [stackId]);

  // Split by timing (handles AM, PM, AM/PM)
  const { am, pm } = useMemo(() => {
    const AM: Item[] = [];
    const PM: Item[] = [];
    for (const i of items) {
      const t = (i.timing ?? "").toUpperCase();
      if (t.includes("AM")) AM.push(i);
      if (t.includes("PM")) PM.push(i);
      if (!t) AM.push(i); // if unknown, show in AM to avoid hiding entirely
    }
    return { am: AM, pm: PM };
  }, [items]);

  // Don’t render the sidebar at all until we have real items (prevents stray AM/PM)
  if (loading || items.length === 0) return null;

  // Optional: click tracking via /api/r
  const track = (url: string, src: "amazon" | "fullscript", itemName: string) =>
    `/api/r?u=${encodeURIComponent(url)}&src=${src}&stack_id=${encodeURIComponent(stackId)}&item=${encodeURIComponent(itemName)}`;

  return (
    <aside className="sticky top-4 space-y-6">
      {error && <div className="text-sm text-red-600">{error}</div)}

      {am.length > 0 && (
        <section>
          <h3 className="font-semibold mb-2">AM</h3>
          <ul className="space-y-1">
            {am.map(i => (
              <li key={i.id} className="flex items-center justify-between">
                <span className="text-sm">{i.name}</span>
                <div className="flex gap-2">
                  {i.link_fullscript && (
                    <a href={track(i.link_fullscript, "fullscript", i.name)} className="text-xs underline">
                      Fullscript
                    </a>
                  )}
                  {i.link_amazon && (
                    <a href={track(i.link_amazon, "amazon", i.name)} className="text-xs underline">
                      Amazon
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {pm.length > 0 && (
        <section>
          <h3 className="font-semibold mb-2">PM</h3>
          <ul className="space-y-1">
            {pm.map(i => (
              <li key={i.id} className="flex items-center justify-between">
                <span className="text-sm">{i.name}</span>
                <div className="flex gap-2">
                  {i.link_fullscript && (
                    <a href={track(i.link_fullscript, "fullscript", i.name)} className="text-xs underline">
                      Fullscript
                    </a>
                  )}
                  {i.link_amazon && (
                    <a href={track(i.link_amazon, "amazon", i.name)} className="text-xs underline">
                      Amazon
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </aside>
  );
}
