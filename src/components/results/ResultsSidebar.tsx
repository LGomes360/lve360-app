"use client";
import { useEffect, useState } from "react";

type Item = {
  id: string;
  name: string;
  timing: string | null;
  link_amazon?: string | null;
  link_fullscript?: string | null;
};

export default function ResultsSidebar({ stackId }: { stackId: string }) {
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/get-stack?id=${stackId}`, { cache: "no-store" });
        const j = await r.json();
        if (!cancelled) setItems(j?.items ?? []);
      } catch (e) {
        if (!cancelled) setError("Couldn’t load stack items.");
      }
    })();
    return () => { cancelled = true; };
  }, [stackId]);

  const am = items.filter(i => (i.timing ?? "").includes("AM"));
  const pm = items.filter(i => (i.timing ?? "").includes("PM"));

  return (
    <aside className="sticky top-4 space-y-6">
      {error && <div className="text-sm text-red-600">{error}</div>}
      <section>
        <h3 className="font-semibold mb-2">AM</h3>
        <ul className="space-y-1">
          {am.map(i => (
            <li key={i.id} className="flex items-center justify-between">
              <span className="text-sm">{i.name}</span>
              <div className="flex gap-2">
                {i.link_fullscript && <a href={i.link_fullscript} className="text-xs underline">Fullscript</a>}
                {i.link_amazon && <a href={i.link_amazon} className="text-xs underline">Amazon</a>}
              </div>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h3 className="font-semibold mb-2">PM</h3>
        <ul className="space-y-1">
          {pm.map(i => (
            <li key={i.id} className="flex items-center justify-between">
              <span className="text-sm">{i.name}</span>
              <div className="flex gap-2">
                {i.link_fullscript && <a href={i.link_fullscript} className="text-xs underline">Fullscript</a>}
                {i.link_amazon && <a href={i.link_amazon} className="text-xs underline">Amazon</a>}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </aside>
  );
}
