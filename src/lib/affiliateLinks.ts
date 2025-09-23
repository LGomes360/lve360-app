// -----------------------------------------------------------------------------
// File: src/lib/affiliate.ts
// Purpose: Attach affiliate links to stack items using `supplements.link`.
// Strategy: Try exact ingredient match; fall back to fuzzy product_name match.
// -----------------------------------------------------------------------------

import { supabaseAdmin as supa } from "@/lib/supabaseAdmin";

export type StackItem = {
  supplement_id?: string;
  name: string;
  dose?: string | null;
  timing?: string | null;
  notes?: string | null;
  rationale?: string | null;
  caution?: string | null;
  citations?: string[] | null;
  link?: string | null;
};

function lc(x?: string | null) { return (x ?? "").trim().toLowerCase(); }

async function findLinkFor(name: string): Promise<string | null> {
  // 1) exact ingredient match
  const { data: exact } = await supa
    .from("supplements")
    .select("link")
    .eq("ingredient", name)
    .maybeSingle();

  if (exact?.link) return exact.link;

  // 2) fuzzy ingredient match
  const { data: fuzzyIng } = await supa
    .from("supplements")
    .select("link,ingredient")
    .ilike("ingredient", `%${name}%`)
    .limit(1);

  if (fuzzyIng && fuzzyIng[0]?.link) return fuzzyIng[0].link;

  // 3) fuzzy product_name as last resort
  const { data: fuzzyProd } = await supa
    .from("supplements")
    .select("link,product_name")
    .ilike("product_name", `%${name}%`)
    .limit(1);

  if (fuzzyProd && fuzzyProd[0]?.link) return fuzzyProd[0].link;

  return null;
}

/**
 * Attach affiliate links to stack items in-place.
 * Leaves link null if none found (frontend can hide the button).
 */
export async function attachAffiliateLinks<T extends StackItem>(items: T[]): Promise<T[]> {
  const out: T[] = [];
  for (const it of items) {
    const link = await findLinkFor(it.name);
    out.push({ ...it, link: link ?? null });
  }
  return out;
}
