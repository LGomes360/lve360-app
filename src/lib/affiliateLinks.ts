// -----------------------------------------------------------------------------
// File: src/lib/affiliateLinks.ts
// Purpose: Attach affiliate links to stack items using multiple link columns.
// Strategy: Select budget/trusted/clean/default for free users; prefer
// Fullscript for premium users if available. Auto-normalize supplement names.
// -----------------------------------------------------------------------------

import { supabaseAdmin as supa } from "@/lib/supabaseAdmin";

// Shared normalization (same as generateStack.ts)
function normalizeSupplementName(name: string): string {
  const n = (name || "").toLowerCase().replace(/[.*_`#]/g, "").trim();
  const collapsed = n.replace(/\s+/g, " ");

  if (collapsed === "l") return "L-Theanine";
  if (collapsed === "b") return "B-Vitamins";
  if (collapsed.includes("b complex") || collapsed.includes("b-vitamins"))
    return "B-Vitamins";

  if (collapsed.startsWith("omega")) return "Omega-3";
  if (collapsed.startsWith("vitamin d")) return "Vitamin D";
  if (collapsed.startsWith("mag")) return "Magnesium";
  if (collapsed.startsWith("ashwa")) return "Ashwagandha";
  if (collapsed.startsWith("bacopa")) return "Bacopa Monnieri";
  if (collapsed.startsWith("coq")) return "CoQ10";
  if (collapsed.startsWith("rhodiola")) return "Rhodiola Rosea";
  if (collapsed.startsWith("ginkgo")) return "Ginkgo Biloba";
  if (collapsed.startsWith("zinc")) return "Zinc";

  if (
    /^acetyl\s*l\b/.test(collapsed) ||
    collapsed.includes("acetyl l carnitine") ||
    collapsed.includes("acetyl-l-carnitine")
  )
    return "Acetyl-L-carnitine";

  return name.trim();
}

export type StackItem = {
  supplement_id?: string;
  name: string;
  dose?: string | null;
  timing?: string | null;
  notes?: string | null;
  rationale?: string | null;
  caution?: string | null;
  citations?: string[] | null;
  // link fields
  link_budget?: string | null;
  link_trusted?: string | null;
  link_clean?: string | null;
  link_default?: string | null;
  link_fullscript?: string | null;
  // resolved link
  link?: string | null;
};

// -----------------------------------------------------------------------------
// Internal helper: choose correct link from row based on prefs + membership
// -----------------------------------------------------------------------------
function chooseLink(
  row: any,
  brandPref: string | null,
  isPremium: boolean
): string | null {
  if (isPremium && row.link_fullscript) return row.link_fullscript;

  switch ((brandPref ?? "").toLowerCase()) {
    case "budget":
      return row.link_budget ?? row.link_default ?? null;
    case "trusted":
      return row.link_trusted ?? row.link_default ?? null;
    case "clean":
      return row.link_clean ?? row.link_default ?? null;
    default:
      return row.link_default ?? null;
  }
}

// -----------------------------------------------------------------------------
// Find all link columns for a given supplement name
// -----------------------------------------------------------------------------
async function findLinksFor(name: string) {
  const normName = normalizeSupplementName(name);

  const cols =
    "link_budget, link_trusted, link_clean, link_default, link_fullscript, ingredient, product_name";

  // 1) exact match on ingredient
  const { data: exact } = await supa
    .from("supplements")
    .select(cols)
    .eq("ingredient", normName)
    .maybeSingle();
  if (exact) return exact;

  // 2) fuzzy ingredient match
  const { data: fuzzyIng } = await supa
    .from("supplements")
    .select(cols)
    .ilike("ingredient", `%${normName}%`)
    .limit(1);
  if (fuzzyIng && fuzzyIng[0]) return fuzzyIng[0];

  // 3) fuzzy product_name match
  const { data: fuzzyProd } = await supa
    .from("supplements")
    .select(cols)
    .ilike("product_name", `%${normName}%`)
    .limit(1);
  if (fuzzyProd && fuzzyProd[0]) return fuzzyProd[0];

  return null;
}

// -----------------------------------------------------------------------------
// Main export
// -----------------------------------------------------------------------------
export async function enrichAffiliateLinks<T extends StackItem>(
  items: T[],
  opts?: { brandPref?: string | null; isPremium?: boolean }
): Promise<T[]> {
  const out: T[] = [];
  const brandPref = opts?.brandPref ?? null;
  const isPremium = opts?.isPremium ?? false;

  for (const it of items) {
    const row = await findLinksFor(it.name);
    const resolvedLink = row ? chooseLink(row, brandPref, isPremium) : null;
    out.push({
      ...it,
      name: normalizeSupplementName(it.name), // ensure persisted name normalized too
      link_budget: row?.link_budget ?? null,
      link_trusted: row?.link_trusted ?? null,
      link_clean: row?.link_clean ?? null,
      link_default: row?.link_default ?? null,
      link_fullscript: row?.link_fullscript ?? null,
      link: resolvedLink,
    });
  }

  return out;
}
