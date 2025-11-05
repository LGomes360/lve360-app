// src/lib/evidence.ts
import evidence from "@/evidence/evidence_index_top3.json";

// Normalize a string into a simple key
const keyOf = (s: string) =>
  s.toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");

// Common alias → canonical JSON key
const EVIDENCE_ALIASES: Record<string, string> = {
  "vitamin d": "vitamin d3",
  "cholecalciferol": "vitamin d3",
  "omega": "omega-3 (epa+dha)",
  "omega 3": "omega-3 (epa+dha)",
  "omega-3": "omega-3 (epa+dha)",
  "epa dha": "omega-3 (epa+dha)",
  "coq10": "coq10 (ubiquinone)",
  "ubiquinone": "coq10 (ubiquinone)",
  "b vitamins": "b-complex",
  "b-vitamins": "b-complex",
  "b complex": "b-complex",
  "ashwagandha": "ashwagandha (ksm-66 or similar)",
  "rhodiola rosea": "rhodiola rosea (3% rosavins)",
  "bacopa monnieri": "bacopa monnieri (50% bacosides)",
  "ginkgo biloba": "ginkgo biloba (24/6)",
  "zinc": "zinc (picolinate)",
  "magnesium": "magnesium (glycinate)",
  "nac": "nac (n-acetylcysteine)"
  "turmeric": "curcumin (95% curcuminoids + piperine)",
  "curcumin": "curcumin (95% curcuminoids + piperine)",
  "probiotic": "probiotic (lacto/bifido blend)",
  "probiotics": "probiotic (lacto/bifido blend)",
  "vitamin b12": "b12 (methylcobalamin)",
  "b12": "b12 (methylcobalamin)",
  "coq10": "coq10 (ubiquinone)",
  "omega-3": "omega-3 (epa+dha)",
  "omega 3": "omega-3 (epa+dha)",
  "zinc": "zinc (picolinate)",
  "magnesium": "magnesium (glycinate)",
  "magnesium glycinate": "magnesium (glycinate)",
  "magnesium bisglycinate": "magnesium (glycinate)",
  "magnesium citrate": "magnesium (glycinate)",
  "magnesium malate": "magnesium (glycinate)",
  "magnesium taurate": "magnesium (glycinate)",
  "magnesium threonate": "magnesium (glycinate)",   // alias threonate for now
  "magtein": "magnesium (glycinate)",               // brand synonym
  "magnesium oxide": "magnesium (glycinate)",
  "magnesium chloride": "magnesium (glycinate)",
  "magnesium sulfate": "magnesium (glycinate)",
  "epsom salt": "magnesium (glycinate)",
   "whey": "protein (whey isolate)",
  "whey isolate": "protein (whey isolate)",
  "whey protein": "protein (whey isolate)",
  "casein": "protein (casein)",
  "protein powder": "protein (whey isolate)",

  // ===== CREATINE =====
  "creatine": "creatine (monohydrate)",
  "creatine monohydrate": "creatine (monohydrate)",

  // ===== FISH OIL / OMEGA-3 =====
  "omega 3": "omega-3 (epa+dha)",
  "omega-3": "omega-3 (epa+dha)",
  "fish oil": "omega-3 (epa+dha)",
  "epa dha": "omega-3 (epa+dha)",

  // ===== MAGNESIUM (MAP ALL FORMS → GLYCINATE unless you add distinct SKUs) =====
  "magnesium": "magnesium (glycinate)",
  "magnesium glycinate": "magnesium (glycinate)",
  "magnesium bisglycinate": "magnesium (glycinate)",
  "magnesium citrate": "magnesium (glycinate)",
  "magnesium malate": "magnesium (glycinate)",
  "magnesium taurate": "magnesium (glycinate)",
  "magnesium threonate": "magnesium (glycinate)",
  "magtein": "magnesium (glycinate)",
  "magnesium oxide": "magnesium (glycinate)",
  "magnesium chloride": "magnesium (glycinate)",
  "magnesium sulfate": "magnesium (glycinate)",
  "epsom salt": "magnesium (glycinate)",

  // ===== B-VITAMINS =====
  "b12": "b12 (methylcobalamin)",
  "vitamin b12": "b12 (methylcobalamin)",
  "cyanocobalamin": "b12 (methylcobalamin)",
  "methylcobalamin": "b12 (methylcobalamin)",

  // ===== VITAMIN D =====
  "vitamin d": "vitamin d3 (cholecalciferol)",
  "vitamin d3": "vitamin d3 (cholecalciferol)",
  "cholecalciferol": "vitamin d3 (cholecalciferol)",

  // ===== ZINC =====
  "zinc": "zinc (picolinate)",
  "zinc picolinate": "zinc (picolinate)",
  "zinc citrate": "zinc (picolinate)",

  // ===== CURCUMIN / TURMERIC =====
  "turmeric": "curcumin (95% curcuminoids + piperine)",
  "curcumin": "curcumin (95% curcuminoids + piperine)",
  "curcumin with piperine": "curcumin (95% curcuminoids + piperine)",

  // ===== COQ10 =====
  "coq10": "coq10 (ubiquinone)",
  "ubiquinone": "coq10 (ubiquinone)",
  "ubiquinol": "coq10 (ubiquinone)",

  // ===== PROBIOTICS =====
  "probiotic": "probiotic (lacto/bifido blend)",
  "probiotics": "probiotic (lacto/bifido blend)",

  // ===== FIBER =====
  "psyllium": "fiber (psyllium husk)",
  "psyllium husk": "fiber (psyllium husk)",
  "glucomannan": "fiber (glucomannan)",
  "fiber": "fiber (psyllium husk)",

  // ===== ELECTROLYTES (OPTIONAL) =====
  "electrolytes": "electrolytes (balanced mix)",
  "oral rehydration": "electrolytes (balanced mix)",

  // 🔑 Add more aliases as needed
};

// Main lookup
export function getTopCitationsFor(name: string, limit = 2): string[] {
  if (!name) return [];

  const norm = keyOf(name);

  // 1. Alias map
  const aliasKey = EVIDENCE_ALIASES[norm];
  if (aliasKey && (evidence as any)[aliasKey]) {
    return sanitizeCitations(
      (evidence as any)[aliasKey].slice(0, limit).map((e: any) => e.url)
    );
  }

  // 2. Exact key match
  if ((evidence as any)[norm]) {
    return sanitizeCitations(
      (evidence as any)[norm].slice(0, limit).map((e: any) => e.url)
    );
  }

  // 3. Fuzzy contains match
  const hit = Object.keys(evidence as any).find((sk) =>
    keyOf(sk).includes(norm)
  );
  if (hit) {
    return sanitizeCitations(
      (evidence as any)[hit].slice(0, limit).map((e: any) => e.url)
    );
  }

  // 4. Nothing found
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
