// src/lib/evidence.ts
import evidence from "@/evidence/evidence_index_top3.json";

// Build a normalized index once so alias and key variations resolve cleanly
const curatedIndex: Record<string, { url: string }[]> = {};
for (const [k, arr] of Object.entries(evidence as any)) {
  curatedIndex[keyOf(k)] = arr as any[];
}

// Rows we never want to cite
const IGNORE_FOR_EVIDENCE = new Set<string>([
  "see dosing notes",
  "see dosing",
  "see notes",
  "-",
  "—",
  "multivitamin" // until we curate it, suppress noisy lookups
]);

// Normalize a string into a simple key
const keyOf = (s: string) =>
  s.toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");

// Common alias → canonical JSON key
const EVIDENCE_ALIASES: Record<string, string> = {
  // --- Vitamins
  "vitamin d": "vitamin d3 (cholecalciferol)",
  "vitamin d3": "vitamin d3 (cholecalciferol)",
  "cholecalciferol": "vitamin d3 (cholecalciferol)",

  "vitamin b12": "b12 (methylcobalamin)",
  "b12": "b12 (methylcobalamin)",
  "cyanocobalamin": "b12 (methylcobalamin)",
  "methylcobalamin": "b12 (methylcobalamin)",

  "b vitamins": "b-complex",
  "b-vitamins": "b-complex",
  "b complex": "b-complex",

  // --- Omegas / fish oil
  "omega": "omega-3 (epa+dha)",
  "omega 3": "omega-3 (epa+dha)",
  "omega-3": "omega-3 (epa+dha)",
  "epa dha": "omega-3 (epa+dha)",
  "fish oil": "omega-3 (epa+dha)",

  // --- CoQ10
  "coq10": "coq10 (ubiquinone)",
  "ubiquinone": "coq10 (ubiquinone)",
  "ubiquinol": "coq10 (ubiquinone)",

  // --- Adaptogens / nootropics
  "ashwagandha": "ashwagandha (ksm-66 or similar)",
  "rhodiola rosea": "rhodiola rosea (3% rosavins)",
  "bacopa monnieri": "bacopa monnieri (50% bacosides)",
  "ginkgo biloba": "ginkgo biloba (24/6)",

  // --- Minerals
  "zinc": "zinc (picolinate)",
  "zinc picolinate": "zinc (picolinate)",
  "zinc citrate": "zinc (picolinate)",

  // map all magnesium forms to the curated key you have today
  "magnesium": "magnesium (glycinate)",
  "magnesium glycinate": "magnesium (glycinate)",
  "magnesium bisglycinate": "magnesium (glycinate)",
  "magnesium citrate": "magnesium (glycinate)",
  "magnesium malate": "magnesium (glycinate)",
  "magnesium taurate": "magnesium (glycinate)",
  "magnesium threonate": "magnesium (glycinate)", // until you add a threonate curated key
  "magtein": "magnesium (glycinate)",
  "magnesium oxide": "magnesium (glycinate)",
  "magnesium chloride": "magnesium (glycinate)",
  "magnesium sulfate": "magnesium (glycinate)",
  "epsom salt": "magnesium (glycinate)",

  // --- Aminos / macros
  "whey": "protein (whey isolate)",
  "whey isolate": "protein (whey isolate)",
  "whey protein": "protein (whey isolate)",
  "casein": "protein (casein)",
  "protein powder": "protein (whey isolate)",
  "l carnitine": "l-carnitine",
  "creatine": "creatine (monohydrate)",
  "creatine monohydrate": "creatine (monohydrate)",

  // --- Curcumin / turmeric
  "turmeric": "curcumin (95% curcuminoids + piperine)",
  "curcumin": "curcumin (95% curcuminoids + piperine)",
  "curcumin with piperine": "curcumin (95% curcuminoids + piperine)",

  // --- Probiotics
  "probiotic": "probiotic (lacto/bifido blend)",
  "probiotics": "probiotic (lacto/bifido blend)",

  // --- Fiber
  "psyllium": "fiber (psyllium husk)",
  "psyllium husk": "fiber (psyllium husk)",
  "glucomannan": "fiber (glucomannan)",
  "fiber": "fiber (psyllium husk)",

  // --- Others
  "nac": "nac (n-acetylcysteine)",

  // --- Electrolytes (optional)
  "electrolytes": "electrolytes (balanced mix)",
  "oral rehydration": "electrolytes (balanced mix)"
};

// Derive a normalized alias map so "omega-3", "omega 3", "OMEGA3" all hit the same key
const ALIASES_BY_KEY: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(EVIDENCE_ALIASES)) {
    out[keyOf(k)] = v;
  }
  return out;
})();

// Names we never want to cite (UI placeholders / non-specific)
const IGNORE_FOR_EVIDENCE = new Set<string>([
  "see dosing notes",
  "see dosing",
  "see notes",
  "-",
  "—",
  "multivitamin" // remove when you add a curated "multivitamin (...)" entry
]);

// Exported canonicalizer used by BOTH evidence + shopping + parser
export function normalizeSupplementName(name: string): string {
  const k = keyOf(name || "");
  return ALIASES_BY_KEY[k] || k; // if not aliased, return normalized key
}

// Build a normalized index from the evidence JSON: keyOf(human-key) -> array of entries
type EvidenceEntry = { url: string; [k: string]: any };
const curatedIndex: Record<string, EvidenceEntry[]> = (() => {
  const out: Record<string, EvidenceEntry[]> = {};
  for (const [humanKey, arr] of Object.entries(evidence as Record<string, EvidenceEntry[]>)) {
    out[keyOf(humanKey)] = arr;
  }
  return out;
})();

// Main lookup
export function getTopCitationsFor(name: string, limit = 2): string[] {
  if (!name) return [];
  const lowered = (name || "").toLowerCase().trim();
  if (IGNORE_FOR_EVIDENCE.has(lowered)) return [];

  // Canonicalize (aliases → curated key), then normalize for index lookup
  const canonical = normalizeSupplementName(name);
  const k = keyOf(canonical);

  const arr =
    curatedIndex[k] ||
    curatedIndex[keyOf(name)] || // fallback to the raw key
    [];

  console.info("evidence.lookup", {
    rawName: name,
    canonical,
    indexKey: k,
    curatedCount: arr.length,
  });

  if (arr.length === 0) return [];
  return sanitizeCitations(arr.slice(0, limit).map((e: any) => e.url));
}


  // 4) Soft fallback: substring search on normalized keys
  const softHitKey = Object.keys(curatedIndex).find((kk) => kk.includes(k));
  if (softHitKey) {
    return sanitizeCitations(curatedIndex[softHitKey].slice(0, limit).map((e) => e.url));
  }

  // 5) Nothing found
  return [];
}


// Enforce PubMed/DOI only
export function sanitizeCitations(urls: string[]): string[] {
  const re =
    /(https?:\/\/(?:pubmed\.ncbi\.nlm\.nih\.gov\/\d+\/|pmc\.ncbi\.nlm\.nih\.gov\/articles\/PMC\d+|doi\.org\/\S+))/i;
  return (urls || [])
    .map((u) => (u || "").trim())
    .filter((u) => re.test(u));
}
