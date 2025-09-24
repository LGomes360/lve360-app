// evidence.ts
import evidence from "@/evidence/evidence_index_top3.json";

// 1) fuzzy key (cheap): lower-case, strip spaces/punct
const keyOf = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");

export function getTopCitationsFor(name: string, limit = 2) {
  const k = keyOf(name);
  // exact key
  if ((evidence as any)[k]) return (evidence as any)[k].slice(0, limit);

  // soft match: try first word, common stems (mag glycinate → magnesium)
  const parts = k.split(" ");
  const probes = [k, parts[0], k.replace(/\b(glycinate|bisglycinate|hcl)\b/g, "")].map(v => v.trim()).filter(Boolean);

  for (const p of probes) {
    const hit = Object.keys(evidence as any).find(sk => sk.includes(p));
    if (hit) return (evidence as any)[hit].slice(0, limit);
  }
  return [];
}

// 2) validator to enforce PubMed/DOI only
export function sanitizeCitations(urls: string[]): string[] {
  const re = /(https?:\/\/(?:pubmed\.ncbi\.nlm\.nih\.gov\/\d+\/|doi\.org\/\S+))/i;
  return (urls || []).map(u => (u || "").trim()).filter(u => re.test(u));
}
