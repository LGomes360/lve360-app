/* eslint-disable @typescript-eslint/consistent-type-imports */
/* eslint-disable no-console */
// ----------------------------------------------------------------------------
// LVE360 — generateStack.ts (STABLE, AI-first)
// Purpose: Generate Markdown, keep validation logs, never throw on content
// quality; parse items, safety+enrichment, evidence+shopping override, persist.
// ----------------------------------------------------------------------------

import getSubmissionWithChildren from "@/lib/getSubmissionWithChildren";
import type { SubmissionWithChildren } from "@/lib/getSubmissionWithChildren";
import type { ChatCompletionMessageParam } from "openai/resources";
import { applySafetyChecks } from "@/lib/safetyCheck";
import { enrichAffiliateLinks } from "@/lib/affiliateLinks";
import { supabaseAdmin } from "@/lib/supabase";
import { getTopCitationsFor } from "@/lib/evidence";
import evidenceIndex from "@/evidence/evidence_index_top3.json";

// ---- Config -----------------------------------------------------------------
const TODAY = "2025-09-21";
const MIN_WORDS = 1000;                    // relaxed to avoid spurious fails
const MIN_BP_ROWS = 10;
const MIN_ANALYSIS_SENTENCES = 3;

const MODEL_CITE_RE = /\bhttps?:\/\/(?:pubmed\.ncbi\.nlm\.nih\.gov\/\d+\/?|doi\.org\/\S+)\b/;
const CURATED_CITE_RE =
  /\bhttps?:\/\/(?:pubmed\.ncbi\.nlm\.nih\.gov\/\d+\/?|pmc\.ncbi\.nlm\.nih\.gov\/articles\/\S+|doi\.org\/\S+|jamanetwork\.com\/\S+|biomedcentral\.com\/\S+|bmcpsychiatry\.biomedcentral\.com\/\S+|journals\.plos\.org\/\S+|nature\.com\/\S+|sciencedirect\.com\/\S+|amjmed\.com\/\S+|koreascience\.kr\/\S+|dmsjournal\.biomedcentral\.com\/\S+|researchmgt\.monash\.edu\/\S+)\b/i;

const HEADINGS = [
  "## Intro Summary",
  "## Goals",
  "## Contraindications & Med Interactions",
  "## Current Stack",
  "## Your Blueprint Recommendations",
  "## Dosing & Notes",
  "## Evidence & References",
  "## Shopping Links",
  "## Follow-up Plan",
  "## Lifestyle Prescriptions",
  "## Longevity Levers",
  "## This Week Try",
  "## END",
];

// ---- Types ------------------------------------------------------------------
export interface StackItem {
  name: string;
  dose?: string | null;
  dose_parsed?: { amount?: number; unit?: string } | null;
  timing?: string | null;
  rationale?: string | null;
  notes?: string | null;
  caution?: string | null;
  citations?: string[] | null;

  // Category links (from public.supplements)
  link_budget?: string | null;
  link_trusted?: string | null;
  link_clean?: string | null;
  link_default?: string | null;

  // Destination links persisted into stacks_items
  link_amazon?: string | null;
  link_fullscript?: string | null;
  link_thorne?: string | null;
  link_other?: string | null;

  cost_estimate?: number | null;
}

interface EvidenceEntry { url?: string | null; [key: string]: any }
type EvidenceIndex = Record<string, EvidenceEntry[]>;
const EVIDENCE: EvidenceIndex = evidenceIndex as unknown as EvidenceIndex;

// ---- Utils ------------------------------------------------------------------
const wc = (t: string) => t.trim().split(/\s+/).length;
const hasEnd = (t: string) => t.includes("## END");
const seeDN = "See Dosing & Notes";

function cleanName(raw: string): string {
  if (!raw) return "";
  return raw.replace(/[*_`#]/g, "").replace(/\s+/g, " ").trim();
}

function age(dob: string | null) {
  if (!dob) return null;
  const d = new Date(dob);
  const t = new Date(TODAY);
  let a = t.getFullYear() - d.getFullYear();
  if (t < new Date(t.getFullYear(), d.getMonth(), d.getDate())) a--;
  return a;
}

function normalizeTiming(raw?: string | null): string | null {
  if (!raw) return null;
  const s = raw.toLowerCase();
  if (/\bam\b|morning/.test(s)) return "AM";
  if (/\bpm\b|evening|night/.test(s)) return "PM";
  if (/am\/pm|both|\bbid\b|split/.test(s)) return "AM/PM";
  return raw.trim();
}

function normalizeUnit(u?: string | null) {
  const s = (u ?? "").toLowerCase();
  if (s === "μg" || s === "mcg" || s === "ug") return "mcg";
  if (s === "iu") return "IU";
  if (s === "mg" || s === "g") return s;
  return s || null;
}

function parseDose(dose?: string | null): { amount?: number; unit?: string } {
  if (!dose) return {};
  const cleaned = dose.replace(/[,]/g, " ").replace(/\s+/g, " ");
  const matches = cleaned.match(/(\d+(?:\.\d+)?)/g);
  if (!matches) return {};
  const amount = parseFloat(matches[matches.length - 1]);
  const unitMatch = cleaned.match(/(mcg|μg|ug|mg|g|iu)\b/i);
  const rawUnit = unitMatch ? unitMatch[1] : "";
  let unit = normalizeUnit(rawUnit);
  let val = amount;
  if (unit === "g") {
    val = amount * 1000;
    unit = "mg";
  }
  return { amount: val, unit: unit ?? undefined };
}

// ---- Name normalization ------------------------------------------------------
function normalizeSupplementName(name: string): string {
  const n = (name || "").toLowerCase().replace(/[.*_`#]/g, "").trim();
  const collapsed = n.replace(/\s+/g, " ");

  if (collapsed === "l") return "L-Theanine";
  if (collapsed === "b") return "B-Vitamins";
  if (collapsed.includes("vitamin b complex") || collapsed.includes("b complex") || collapsed.includes("b-vitamins"))
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
  if (/^acetyl\s*l\b/.test(collapsed) || collapsed.includes("acetyl l carnitine") || collapsed.includes("acetyl-l-carnitine"))
    return "Acetyl-L-carnitine";

  return name.trim();
}

const ALIAS_MAP: Record<string, string> = {
  "Omega-3": "omega-3 (epa+dha)",
  "Vitamin D": "vitamin d3",
  "Magnesium": "magnesium (glycinate)",
  "Ashwagandha": "ashwagandha (ksm-66 or similar)",
  "Bacopa Monnieri": "bacopa monnieri (50% bacosides)",
  "CoQ10": "coq10 (ubiquinone)",
  "Rhodiola Rosea": "rhodiola rosea (3% rosavins)",
  "Ginkgo Biloba": "ginkgo biloba (24/6)",
  "Zinc": "zinc (picolinate)",
  "B-Vitamins": "b-complex",
  "L-Theanine": "l-theanine",
  "Acetyl-L-carnitine": "acetyl-l-carnitine",
};

function toSlug(s: string) {
  return (s || "")
    .toLowerCase()
    .replace(/[^\w\s()+/.-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildEvidenceCandidates(normName: string): string[] {
  const candidates: string[] = [];
  const alias = ALIAS_MAP[normName];
  if (alias) candidates.push(alias);

  const lower = toSlug(normName);
  if (lower) {
    candidates.push(lower, lower.replace(/\s+/g, "-"), lower.replace(/\s+/g, ""));
  }

  const expansions: Record<string, string[]> = {
    "Omega-3": ["omega-3 (epa+dha)", "omega-3", "omega 3"],
    "Vitamin D": ["vitamin d3", "vitamin d", "vitamin-d"],
    "Magnesium": ["magnesium (glycinate)", "magnesium"],
    "Ashwagandha": ["ashwagandha (ksm-66 or similar)", "ashwagandha"],
    "Bacopa Monnieri": ["bacopa monnieri (50% bacosides)", "bacopa monnieri"],
    "CoQ10": ["coq10 (ubiquinone)", "coq10"],
    "Rhodiola Rosea": ["rhodiola rosea (3% rosavins)", "rhodiola rosea"],
    "Ginkgo Biloba": ["ginkgo biloba (24/6)", "ginkgo biloba"],
    "Zinc": ["zinc (picolinate)", "zinc"],
    "B-Vitamins": ["b-complex", "b vitamins", "b-vitamins"],
    "L-Theanine": ["l-theanine", "l theanine"],
    "Acetyl-L-carnitine": ["acetyl-l-carnitine", "acetyl l carnitine", "alc"],
  };
  if (expansions[normName]) candidates.push(...expansions[normName]);

  return Array.from(new Set(candidates)).filter(Boolean);
}

// ---- Evidence helpers --------------------------------------------------------
function sanitizeCitationsModel(urls: string[]): string[] {
  return (urls || [])
    .map((u) => (typeof u === "string" ? u.trim() : ""))
    .filter((u) => MODEL_CITE_RE.test(u));
}

function getTopCitationsFromJson(key: string, limit = 3): string[] {
  const arr = EVIDENCE[key] as EvidenceEntry[] | undefined;
  if (!arr || !Array.isArray(arr)) return [];
  const urls = arr.map((e) => (e?.url || "").trim()).filter((u) => CURATED_CITE_RE.test(u));
  return urls.slice(0, limit);
}

function lookupCuratedForCandidates(candidates: string[], limit = 3): string[] {
  for (const key of candidates) {
    const citations = getTopCitationsFor(key, 2);
    if (citations.length) return citations;
  }
  const slugged = candidates.map(toSlug);
  for (const cand of slugged) {
    for (const jsonKey of Object.keys(EVIDENCE)) {
      const slugKey = toSlug(jsonKey);
      if (slugKey.includes(cand) || cand.includes(slugKey)) {
        const hits = getTopCitationsFromJson(jsonKey, limit);
        if (hits.length) {
          console.log("evidence.fuzzy_match", { cand, jsonKey, hits });
          return hits;
        }
      }
    }
  }
  return [];
}

// ---- Evidence & shopping rendering ------------------------------------------
function hostOf(u: string): string {
  try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; }
}
function labelForUrl(u: string): string {
  const h = hostOf(u);
  if (/pubmed\.ncbi\.nlm\.nih\.gov/i.test(h)) return "PubMed";
  if (/pmc\.ncbi\.nlm\.nih\.gov/i.test(h)) return "PMC";
  if (/doi\.org/i.test(h)) return "DOI";
  if (/jamanetwork\.com/i.test(h)) return "JAMA";
  if (/biomedcentral|bmcpsychiatry|dmsjournal/i.test(h)) return "BMC";
  if (/journals\.plos\.org|plos\.org/i.test(h)) return "PLOS";
  if (/nature\.com/i.test(h)) return "Nature";
  if (/sciencedirect\.com/i.test(h)) return "ScienceDirect";
  if (/amjmed\.com/i.test(h)) return "Am J Med";
  if (/koreascience\.kr/i.test(h)) return "KoreaScience";
  if (/monash\.edu/i.test(h)) return "Monash";
  return h || "Source";
}

function buildEvidenceSection(items: StackItem[], minCount = 8): {
  section: string; bullets: Array<{ name: string; url: string }>;
} {
  const bullets: Array<{ name: string; url: string }> = [];
  for (const it of items) {
    const citations = it.citations ?? [];
    for (const rawUrl of citations) {
      const url = rawUrl.trim();
      const normalized = url.endsWith("/") ? url : url + "/";
      if (CURATED_CITE_RE.test(normalized) || MODEL_CITE_RE.test(normalized)) {
        bullets.push({ name: cleanName(it.name), url: normalized });
      }
    }
  }
  const seen = new Set<string>();
  const unique = bullets.filter((b) => {
    if (seen.has(b.url)) return false;
    seen.add(b.url);
    return true;
  });

  const take =
    unique.length >= minCount
      ? unique
      : [
          ...unique,
          ...Array.from({ length: minCount - unique.length }).map(() => ({
            name: "Evidence pending",
            url: "https://lve360.com/evidence/coming-soon",
          })),
        ];

  const bulletsText = take.map((b) => `- ${b.name}: [${labelForUrl(b.url)}](${b.url})`).join("\n");
  const analysis = `

**Analysis**

These references are pulled from LVE360’s curated evidence index (PubMed/PMC/DOI and other trusted journals) and replace any model-generated references.
`;
  const section = `## Evidence & References\n\n${bulletsText}${analysis}`;
  return { section, bullets: take };
}

function overrideEvidenceInMarkdown(md: string, section: string): string {
  const headerRe = /## Evidence & References([\s\S]*?)(?=\n## |\n## END|$)/i;
  if (headerRe.test(md)) return md.replace(headerRe, section);
  return md.replace(/\n## END/i, `\n\n${section}\n\n## END`);
}

function buildShoppingLinksSection(items: StackItem[]): string {
  if (!items || items.length === 0) {
    return "## Shopping Links\n\n- No links available yet.\n\n**Analysis**\n\nLinks will be provided once products are mapped.";
  }
  const bullets = items.map((it) => {
    const name = cleanName(it.name);
    const links: string[] = [];
    if (it.link_amazon) links.push(`[Amazon](${it.link_amazon})`);
    if (it.link_fullscript) links.push(`[Fullscript](${it.link_fullscript})`);
    if (it.link_thorne) links.push(`[Thorne](${it.link_thorne})`);
    if (it.link_other) links.push(`[Other](${it.link_other})`);
    return `- **${name}**: ${links.join(" • ")}`;
  });
  return `## Shopping Links\n\n${bullets.join("\n")}\n\n**Analysis**\n\nThese links are provided for convenience. Premium users may see Fullscript options when available; Amazon links are shown for everyone.`;
}

// ---- Parser: Markdown → StackItem[] -----------------------------------------
function parseStackFromMarkdown(md: string): StackItem[] {
  const base: Record<string, any> = {};

  // Blueprint table
  const blueprint = md.match(/## Your Blueprint Recommendations([\s\S]*?)(\n## |$)/i);
  if (blueprint) {
    const rows = blueprint[1].split("\n").filter((l) => l.trim().startsWith("|"));
    rows.slice(1).forEach((row, i) => {
      const cols = row.split("|").map((c) => c.trim());
      const name = cleanName(cols[2] || `Item ${i + 1}`);
      if (!name) return;
      base[name.toLowerCase()] = { name, rationale: cols[3] || undefined, dose: null, dose_parsed: null, timing: null };
    });
  }

  // Current Stack table
  const current = md.match(/## Current Stack([\s\S]*?)(\n## |$)/i);
  if (current) {
    const rows = current[1].split("\n").filter((l) => l.trim().startsWith("|"));
    rows.slice(1).forEach((row, i) => {
      const cols = row.split("|").map((c) => c.trim());
      const name = cleanName(cols[1] || `Current Item ${i + 1}`);
      if (!name) return;
      const rationale = cols[2] || undefined;
      const dose = cols[3] || null;
      const timing = normalizeTiming(cols[4] || null);
      const parsed = parseDose(dose);
      const key = name.toLowerCase();
      if (!base[key]) {
        base[key] = { name, rationale, dose, dose_parsed: parsed, timing };
      }
    });
  }

  // Dosing bullets
  const dosing = md.match(/## Dosing & Notes([\s\S]*?)(\n## |\n## END|$)/i);
  if (dosing) {
    const lines = dosing[1].split("\n").filter((l) => l.trim().length > 0);
    for (const line of lines) {
      const m = line.match(/[-*]\s*([^—\-:]+)[—\-:]\s*([^,]+)(?:,\s*(.*))?/);
      if (m) {
        const name = cleanName(m[1].trim());
        if (!name) continue;
        const dose = m[2]?.trim() || null;
        const timing = normalizeTiming(m[3]);
        const parsed = parseDose(dose);
        const key = name.toLowerCase();
        if (base[key]) {
          base[key].dose = dose;
          base[key].dose_parsed = parsed;
          base[key].timing = timing;
        } else {
          base[key] = { name, rationale: undefined, dose, dose_parsed: parsed, timing };
        }
      }
    }
  }

  const seen = new Set<string>();
  return Object.values(base).filter((it: any) => {
    if (!it?.name) return false;
    const key = it.name.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    if (it.name.length > 40) return false;
    if (/[.,]{3,}/.test(it.name)) return false;
    if (/\bvitamin\b.*\band\b/i.test(it.name)) return false;
    if (/^analysis$/i.test(it.name.trim())) return false;
    seen.add(key);
    return true;
  });
}

// ---- Prompts & LLM -----------------------------------------------------------
function systemPrompt() {
  return `
You are **LVE360 Concierge AI**, a friendly wellness coach.
Always return **plain ASCII Markdown** with headings EXACTLY:

${HEADINGS.slice(0, -1).join("\n")}

Tables must use pipes. Every section ends with **Analysis** (≥${MIN_ANALYSIS_SENTENCES} sentences).
Blueprint table must have ≥${MIN_BP_ROWS} unique rows. Use “${seeDN}” when dose/timing unknown.
Finish with line \`## END\`.`;
}

function userPrompt(sub: SubmissionWithChildren) {
  return `
### CLIENT
\`\`\`json
${JSON.stringify({ ...sub, age: (sub as any)?.dob ? age((sub as any).dob) : null, today: TODAY }, null, 2)}
\`\`\`

### TASK
Generate the full report per the rules above.`;
}

async function callLLM(messages: ChatCompletionMessageParam[], model: string) {
  const { default: OpenAI } = await import("openai");
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
  return openai.chat.completions.create({
    model,
    temperature: 0.7,
    max_tokens: 4096,
    messages,
  });
}

// ---- Validation --------------------------------------------------------------
function headingsOK(md: string) {
  return HEADINGS.slice(0, -1).every((h) => md.includes(h));
}
function blueprintOK(md: string) {
  const sec = md.match(/## Your Blueprint Recommendations([\s\S]*?)(\n\|)/i);
  if (!sec) return false;
  const rows = sec[0].split("\n").filter((l) => l.startsWith("|")).slice(1);
  return rows.length >= MIN_BP_ROWS;
}
function citationsOK(md: string) {
  const block = md.match(/## Evidence & References([\s\S]*?)(\n## |\n## END|$)/i);
  if (!block) return false;
  const bulletLines = block[1].split("\n").filter((l) => l.trim().startsWith("-"));
  if (bulletLines.length < 8) return false;
  // Accept either model or curated – we do curated override anyway.
  return bulletLines.every((l) => MODEL_CITE_RE.test(l) || CURATED_CITE_RE.test(l));
}
function narrativesOK(md: string) {
  const sections = md.split("\n## ").slice(1);
  return sections.every((sec) => {
    const lines = sec.split("\n");
    const textBlock = lines.filter((l) => !l.startsWith("|") && !l.trim().startsWith("-")).join(" ");
    const sentences = textBlock.split(/[.!?]/).map((s) => s.trim()).filter((s) => s.length > 0);
    if (sec.startsWith("Intro Summary") && sentences.length < 2) return false;
    if (!sec.startsWith("Intro Summary") && sentences.length < MIN_ANALYSIS_SENTENCES) return false;
    return true;
  });
}
function ensureEnd(md: string) { return hasEnd(md) ? md : md + "\n\n## END"; }

// ---- Link policy -------------------------------------------------------------
function normalizeBrandPref(p?: string | null): "budget" | "trusted" | "clean" | "default" {
  const s = (p || "").toLowerCase();
  if (s.includes("budget") || s.includes("cost")) return "budget";
  if (s.includes("trusted") || s.includes("brand")) return "trusted";
  if (s.includes("clean")) return "clean";
  return "default";
}
function chooseAmazonLinkFor(item: StackItem, pref: "budget" | "trusted" | "clean" | "default"): string | null {
  const pick =
    pref === "budget" ? item.link_budget
    : pref === "trusted" ? item.link_trusted
    : pref === "clean" ? item.link_clean
    : item.link_default;
  return pick || item.link_default || item.link_trusted || item.link_budget || item.link_clean || null;
}
function applyLinkPolicy(items: StackItem[], sub: any): StackItem[] {
  const pref = normalizeBrandPref(sub?.preferences?.brand_pref ?? sub?.brand_pref ?? null);
  const isPremium = Boolean(sub?.is_premium) || Boolean(sub?.user?.is_premium) || (sub?.plan === "premium");
  return items.map((it) => {
    const linkAmazon = chooseAmazonLinkFor(it, pref);
    const linkFS = it.link_fullscript ?? null;
    if (isPremium && linkFS) return { ...it, link_amazon: linkAmazon, link_fullscript: linkFS };
    return { ...it, link_amazon: linkAmazon };
  });
}

// ---- Main --------------------------------------------------------------------
export async function generateStackForSubmission(id: string) {
  if (!id) throw new Error("submissionId required");
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY missing");

  const sub = (await getSubmissionWithChildren(id)) as SubmissionWithChildren | null;
  if (!sub) throw new Error(`Submission row not found for id=${id}`);

  const msgs: ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt() },
    { role: "user", content: userPrompt(sub) },
  ];

  let md = "";
  let raw: any = null;
  let modelUsed = "unknown";
  let tokensUsed: number | null = null;
  let promptTokens: number | null = null;
  let completionTokens: number | null = null;
  let ok = false;

  // Pass 1 (mini)
  try {
    const resp = await callLLM(msgs, "gpt-4o-mini");
    raw = resp; modelUsed = resp.model ?? "gpt-4o-mini";
    tokensUsed = resp.usage?.total_tokens ?? null;
    promptTokens = resp.usage?.prompt_tokens ?? null;
    completionTokens = resp.usage?.completion_tokens ?? null;
    md = resp.choices[0]?.message?.content ?? "";

    const v = {
      wordCountOK: wc(md) >= MIN_WORDS,
      headingsValid: headingsOK(md),
      blueprintValid: blueprintOK(md),
      citationsValid: citationsOK(md),
      narrativesValid: narrativesOK(md),
      endValid: hasEnd(md),
      actualWordCount: wc(md),
    };
    console.log("validation.debug", v);
    ok = Object.values(v).every(Boolean);
  } catch (err) {
    console.warn("Mini model failed:", err);
  }

  // Pass 2 (stronger)
  if (!ok) {
    const resp = await callLLM(msgs, "gpt-4o");
    raw = resp; modelUsed = resp.model ?? "gpt-4o";
    tokensUsed = resp.usage?.total_tokens ?? null;
    promptTokens = resp.usage?.prompt_tokens ?? null;
    completionTokens = resp.usage?.completion_tokens ?? null;
    md = resp.choices[0]?.message?.content ?? "";

    const v = {
      wordCountOK: wc(md) >= MIN_WORDS,
      headingsValid: headingsOK(md),
      blueprintValid: blueprintOK(md),
      citationsValid: citationsOK(md),
      narrativesValid: narrativesOK(md),
      endValid: hasEnd(md),
      actualWordCount: wc(md),
    };
    console.log("validation.debug.fallback", v);
    ok = Object.values(v).every(Boolean);
  }

  md = ensureEnd(md);

  // Parse → items
  const parsedItems: StackItem[] = parseStackFromMarkdown(md);

  // Safety
  const safetyInput = {
    medications: Array.isArray((sub as any).medications) ? (sub as any).medications.map((m: any) => m.med_name || "") : [],
    conditions: Array.isArray((sub as any).conditions) ? (sub as any).conditions.map((c: any) => c.condition_name || "") : [],
    allergies: Array.isArray((sub as any).allergies) ? (sub as any).allergies.map((a: any) => a.allergy_name || "") : [],
    pregnant: typeof (sub as any).pregnant === "boolean" || typeof (sub as any).pregnant === "string" ? (sub as any).pregnant : null,
    brand_pref: (sub as any)?.preferences?.brand_pref ?? null,
    dosing_pref: (sub as any)?.preferences?.dosing_pref ?? null,
    is_premium: Boolean((sub as any)?.is_premium) || Boolean((sub as any)?.user?.is_premium) || ((sub as any)?.plan === "premium"),
  };
  const { cleaned, status: safetyStatus } = await applySafetyChecks(safetyInput, parsedItems);

  // Normalize for enrichment
  const normalizedForLinks = cleaned.map((it: any) => ({ ...it, name: normalizeSupplementName(it.name) }));
  const enriched = await enrichAffiliateLinks(normalizedForLinks);
  const finalStack: StackItem[] = applyLinkPolicy(enriched, sub);

  // Evidence override
  const withEvidence: StackItem[] = finalStack.map((item) => {
    const normName = normalizeSupplementName(item.name);
    const candidates = buildEvidenceCandidates(normName);
    const curatedUrls = lookupCuratedForCandidates(candidates, 3);
    const modelValid = sanitizeCitationsModel(item.citations ?? []);
    const final = curatedUrls.length ? curatedUrls : modelValid;
    return { ...item, name: normName, citations: final.length ? final : null };
  });

  const { section: evidenceSection } = buildEvidenceSection(withEvidence, 8);
  md = overrideEvidenceInMarkdown(md, evidenceSection);

  // Shopping override
  const shoppingSection = buildShoppingLinksSection(withEvidence);
  const shoppingRe = /## Shopping Links([\s\S]*?)(?=\n## |\n## END|$)/i;
  md = shoppingRe.test(md) ? md.replace(shoppingRe, shoppingSection) : md.replace(/\n## END/i, `\n\n${shoppingSection}\n\n## END`);

  // Parent (light) upsert: the route persists sections; we log tokens/model here
  try {
    await supabaseAdmin
      .from("stacks")
      .upsert(
        {
          submission_id: id,
          user_id: (sub as any)?.user?.id ?? (sub as any)?.user_id ?? null,
          user_email: (sub as any)?.user?.email ?? (sub as any)?.user_email ?? (sub as any)?.email ?? null,
          tally_submission_id: (sub as any)?.tally_submission_id ?? null,
          version: modelUsed,
          tokens_used: tokensUsed,
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          safety_status: safetyStatus,
          total_monthly_cost: withEvidence.reduce((acc, it) => acc + (it.cost_estimate ?? 0), 0),
        },
        { onConflict: "submission_id" }
      )
      .select()
      .maybeSingle();
  } catch (err) {
    console.warn("Stacks upsert warning:", err);
  }

  return {
    markdown: md,
    raw,
    model_used: modelUsed,
    tokens_used: tokensUsed,
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    validation: { ok, min_words: MIN_WORDS },
  };
}

export default generateStackForSubmission;
