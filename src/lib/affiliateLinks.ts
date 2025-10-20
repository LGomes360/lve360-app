// -----------------------------------------------------------------------------
// File: src/lib/affiliateLinks.ts
// Purpose: Attach affiliate links to stack items using multiple link columns.
// Strategy: Prefer Fullscript for premium users (if available). For everyone,
//           choose budget/trusted/clean/default. If no curated link exists,
//           fall back to a **search URL** on Amazon with the Associates tag.
// -----------------------------------------------------------------------------

import { supabaseAdmin as supa } from "@/lib/supabaseAdmin";

// ---------- Config ----------------------------------------------------------------
const AMAZON_TAG = process.env.NEXT_PUBLIC_AMAZON_TAG || "lve360-20";

// ---------- Normalization (mirrors generateStack.ts) -------------------------------
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

// ---------- Public types ------------------------------------------------------------
export type StackItem = {
  supplement_id?: string;
  name: string;
  dose?: string | null;
  timing?: string | null;
  notes?: string | null;
  rationale?: string | null;
  caution?: string | null;
  citations?: string[] | null;
  // link fields (curated/category)
  link_budget?: string | null;
  link_trusted?: string | null;
  link_clean?: string | null;
  link_default?: string | null;
  // partner link
  link_fullscript?: string | null;
  // resolved link the UI can choose to use (optional)
  link?: string | null;
};

// ---------- Helpers ----------------------------------------------------------------

// Build an Amazon search URL as a universal fallback.
// Keeps search within Health & Household (i=hpc) and appends Associates tag.
export function buildAmazonSearchLink(name: string, dose?: string | null): string {
  const parts: string[] = [];
  const base = (name || "").toString().trim();
  if (base) parts.push(base);

  // Add a compact dose token if present (improves search quality)
  const doseToken = (dose || "")
    .toString()
    .toLowerCase()
    .match(/(\d+(?:\.\d+)?\s?(?:mg|mcg|iu|g))/)?.[1];

  if (doseToken) parts.push(doseToken);

  // Helpful generic keyword
  parts.push("supplement");

  const q = encodeURIComponent(parts.join(" ").replace(/\s+/g, " ").trim());
  return `https://www.amazon.com/s?k=${q}&i=hpc&tag=${encodeURIComponent(AMAZON_TAG)}`;
}

// Choose a curated link based on brand preference + membership.
// NOTE: This works on a "row" from the DB (supplements table), not on the item itself.
function chooseLinkFromRow(
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

// ---------- DB lookups --------------------------------------------------------------
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

// ---------- Main enrichment ---------------------------------------------------------
export async function enrichAffiliateLinks<T extends StackItem>(
  items: T[],
  opts?: { brandPref?: string | null; isPremium?: boolean }
): Promise<T[]> {
  const out: T[] = [];
  const brandPref = opts?.brandPref ?? null;
  const isPremium = opts?.isPremium ?? false;

  for (const it of items) {
    const normName = normalizeSupplementName(it.name);
    const row = await findLinksFor(normName);

    // Start with whatever the DB has
    let link_budget = row?.link_budget ?? null;
    let link_trusted = row?.link_trusted ?? null;
    let link_clean = row?.link_clean ?? null;
    let link_default = row?.link_default ?? null;
    const link_fullscript = row?.link_fullscript ?? null;

    // If no curated/category link exists at all, create a **search fallback**
    if (!link_default && !link_trusted && !link_budget && !link_clean) {
      link_default = buildAmazonSearchLink(normName, it.dose);
    }

    // Pick a resolved link for convenience (UI may still show both Amazon + Fullscript)
    let resolved = chooseLinkFromRow(
      {
        link_budget,
        link_trusted,
        link_clean,
        link_default,
        link_fullscript,
      },
      brandPref,
      isPremium
    );

    // Final safety net: if still nothing, force-search
    if (!resolved) {
      resolved = buildAmazonSearchLink(normName, it.dose);
    }

    out.push({
      ...it,
      name: normName, // ensure persisted name normalized too
      link_budget,
      link_trusted,
      link_clean,
      link_default,
      link_fullscript,
      link: resolved,
    });
  }

  return out;
}
