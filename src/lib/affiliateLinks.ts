// -----------------------------------------------------------------------------
// File: src/lib/affiliateLinks.ts
// Purpose: Attach affiliate links to stack items using multiple link columns.
// Strategy: Normalize supplement names → look up links in supplements table →
// choose budget/trusted/clean/default for free users; prefer Fullscript for premium.
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
  // new link fields
  link_budget?: string | null;
  link_trusted?: string | null;
  link_clean?: string | null;
  link_default?: string | null;
  link_fullscript?: string | null;
  // resolved link chosen for this user
  link?: string | null;
};

// -----------------------------------------------------------------------------
// Name normalization + alias mapping
// -----------------------------------------------------------------------------
function normalizeSupplementName(name: string): string {
  const n = (name || "").toLowerCase().trim();

  if (n.startsWith("omega-3") || n.includes("fatty acid")) return "Omega-3";
  if (n.startsWith("coenzyme q10") || n.startsWith("co q10") || n.startsWith("coq10"))
    return "CoQ10";
  if (n.includes("ashwa")) return "Ashwagandha";
  if (n.includes("bacopa")) return "Bacopa Monnieri";
  if (n.includes("rhodiola")) return "Rhodiola Rosea";
  if (n.includes("ginkgo")) return "Ginkgo Biloba";
  if (n.includes("zinc")) return "Zinc";
  if (n.includes("magnesium")) return "Magnesium";
  if (n.includes("vitamin d")) return "Vitamin D";
  if (n.includes("vitamin k2")) return "Vitamin K2";
  if (n.includes("l-theanine") || n.includes("theanine")) return "L-Theanine";

  // fall back to raw cleaned name
  return name.trim();
}

// Map normalized names to supplement table keys
const ALIAS_MAP: Record<string, string> = {
  "Omega-3": "omega-3 (epa+dha)",
  "CoQ10": "coq10 (ubiquinone)",
  "Ashwagandha": "ashwagandha (ksm-66 or similar)",
  "Bacopa Monnieri": "bacopa monnieri (50% bacosides)",
  "Rhodiola Rosea": "rhodiola rosea (3% rosavins)",
  "Ginkgo Biloba": "ginkgo biloba (24/6)",
  "Zinc": "zinc (picolinate)",
  "Magnesium": "magnesium (glycinate)",
  "Vitamin D": "vitamin d3",
  "Vitamin K2": "vitamin k2",
  "L-Theanine": "l-theanine",
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
  // Normalize first
  const norm = normalizeSupplementName(name);
  const key = ALIAS_MAP[norm] ?? norm;

  const cols =
    "link_budget, link_trusted, link_clean, link_default, link_fullscript, ingredient, product_name";

  // 1) exact match on ingredient
  const { data: exact } = await supa
    .from("supplements")
    .select(cols)
    .eq("ingredient", key)
    .maybeSingle();

  if (exact) return exact;

  // 2) fuzzy ingredient match
  const { data: fuzzyIng } = await supa
    .from("supplements")
    .select(cols)
    .ilike("ingredient", `%${key}%`)
    .limit(1);

  if (fuzzyIng && fuzzyIng[0]) return fuzzyIng[0];

  // 3) fuzzy product_name match
  const { data: fuzzyProd } = await supa
    .from("supplements")
    .select(cols)
    .ilike("product_name", `%${key}%`)
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
