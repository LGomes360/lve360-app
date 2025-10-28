/* eslint-disable @typescript-eslint/consistent-type-imports */
/* eslint-disable no-console */
// ----------------------------------------------------------------------------
// LVE360 — generateStack.ts (REWRITTEN, HARDENED, TIER-AWARE)
// Purpose: Generate validated Markdown report, parse StackItems, run safety,
// affiliate enrichment (Amazon category links + Fullscript), attach evidence,
// override Markdown Evidence section, and persist into Supabase.
// ----------------------------------------------------------------------------

import getSubmissionWithChildren from "@/lib/getSubmissionWithChildren";
import type { SubmissionWithChildren } from "@/lib/getSubmissionWithChildren";
import { ChatCompletionMessageParam } from "openai/resources";
import { applySafetyChecks } from "@/lib/safetyCheck";
import { enrichAffiliateLinks } from "@/lib/affiliateLinks";
import { supabaseAdmin } from "@/lib/supabase";
import { getTopCitationsFor } from "@/lib/evidence";
import parseMarkdownToItems from "@/lib/parseMarkdownToItems";
import { buildAmazonSearchLink } from "@/lib/affiliateLinks";
import { callLLM as callOpenAI } from "@/lib/openai";

// --- Curated evidence index (JSON) ------------------------------------------
import evidenceIndex from "@/evidence/evidence_index_top3.json";

// ----------------------------------------------------------------------------
// Config
// ----------------------------------------------------------------------------
const TODAY = "2025-09-21"; // deterministic for tests
const MIN_WORDS = 1800;
const MIN_BP_ROWS = 10;
const MIN_ANALYSIS_SENTENCES = 3;

// Model-generated refs allowed (strict)
const MODEL_CITE_RE =
  /\bhttps?:\/\/(?:pubmed\.ncbi\.nlm\.nih\.gov\/\d+\/?|doi\.org\/\S+)\b/;

// Curated refs allowed (broader)
const CURATED_CITE_RE =
  /\bhttps?:\/\/(?:pubmed\.ncbi\.nlm\.nih\.gov\/\d+\/?|pmc\.ncbi\.nlm\.nih\.gov\/articles\/\S+|doi\.org\/\S+|jamanetwork\.com\/\S+|biomedcentral\.com\/\S+|bmcpsychiatry\.biomedcentral\.com\/\S+|journals\.plos\.org\/\S+|nature\.com\/\S+|sciencedirect\.com\/\S+|amjmed\.com\/\S+|koreascience\.kr\/\S+|dmsjournal\.biomedcentral\.com\/\S+|researchmgt\.monash\.edu\/\S+)\b/i;

// Markdown headings contract
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

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------
export type GenerateMode = "free" | "premium";
export interface GenerateOptions {
  mode?: GenerateMode;       // default inferred from submission; route will pass
  maxItems?: number;         // hard cap (e.g., 3 for free)
  forceRegenerate?: boolean; // keep for parity with future use
}

export interface StackItem {
  name: string;
  dose?: string | null;
  dose_parsed?: { amount?: number; unit?: string };
  timing?: string | null;
  rationale?: string | null;
  notes?: string | null;
  caution?: string | null;
  citations?: string[] | null;
  is_current?: boolean;           // ← new: true if listed in "Current Stack"
  timing_bucket?: "AM" | "PM" | "AM/PM" | "Anytime" | null; // ← new normalized
  timing_text?: string | null;    // ← new: original free-text timing
  
  // Category links (populated by enrichAffiliateLinks from public.supplements)
  link_budget?: string | null;
  link_trusted?: string | null;
  link_clean?: string | null;
  link_default?: string | null;

  // Destination links persisted into stacks_items
  link_amazon?: string | null;     // <- chosen from the 4 categories
  link_fullscript?: string | null; // <- as provided by enrichment (if any)
  link_thorne?: string | null;
  link_other?: string | null;

  cost_estimate?: number | null;
}
// Row shape we insert into public.stacks_items
interface StackItemRow {
  stack_id: string;
  user_id: string;
  user_email: string | null;
  name: string;
  dose: string | null;
  timing: string | null;
  notes: string | null;
  rationale: string | null;
  caution: string | null;
  citations: string | null;
  link_amazon: string | null;
  link_fullscript: string | null;
  link_thorne: string | null;
  link_other: string | null;
  cost_estimate: number | null;
}

interface EvidenceEntry {
  url?: string | null;
  [key: string]: any;
}

type EvidenceIndex = Record<string, EvidenceEntry[]>;
const EVIDENCE: EvidenceIndex = (evidenceIndex as unknown) as EvidenceIndex;

// ----------------------------------------------------------------------------
// Utilities
// ----------------------------------------------------------------------------
const wc = (t: string) => (t || "").trim().split(/\s+/).filter(Boolean).length;
const hasEnd = (t: string) => (t || "").includes("## END");
const seeDN = "See Dosing & Notes";
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const asArray = <T>(v: T[] | null | undefined): T[] => (Array.isArray(v) ? v : []);

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

function extractUserId(sub: any): string | null {
  return sub?.user_id ?? (typeof sub.user === "object" ? sub.user?.id : null) ?? null;
}

function normalizeTiming(raw?: string | null): string | null {
  if (!raw) return null;
  const s = raw.toLowerCase();
  if (/\bam\b|morning/.test(s)) return "AM";
  if (/\bpm\b|evening|night/.test(s)) return "PM";
  if (/am\/pm|both|split|\bbid\b/.test(s)) return "AM/PM";
  return raw.trim();
}

function classifyTimingBucket(text?: string | null): "AM" | "PM" | "AM/PM" | "Anytime" | null {
  if (!text) return null;
  const s = text.toLowerCase();
  const am = /\b(am|morning|breakfast)\b/.test(s);
  const pm = /\b(pm|evening|night|bedtime)\b/.test(s);
  const bothWords = /\b(bid|twice|2x|am\/pm|split)\b/.test(s);
  const meals = /\b(with (meals?|food))\b/.test(s);
  if (am && pm) return "AM/PM";
  if (bothWords) return "AM/PM";
  if (am) return "AM";
  if (pm) return "PM";
  if (meals) return "Anytime";
  return null;
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

// ----------------------------------------------------------------------------
// Name normalization + aliasing for evidence lookup
// ----------------------------------------------------------------------------
function normalizeSupplementName(name: string): string {
  const n = (name || "").toLowerCase().replace(/[.*_`#]/g, "").trim();
  const collapsed = n.replace(/\s+/g, " ");

  if (collapsed === "l") return "L-Theanine";
  if (collapsed === "b") return "B-Vitamins";

  // Explicit catch for Vitamin B Complex
  if (collapsed.includes("vitamin b complex") || collapsed.includes("b complex") || collapsed.includes("b-vitamins")) {
    return "B-Vitamins";
  }

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

  // Vitamin B Complex handling
  "B-Vitamins": "b-complex",
  "B Vitamins Complex": "b-complex",
  "Vitamin B Complex": "b-complex",

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

// ----------------------------------------------------------------------------
// Evidence helpers
// ----------------------------------------------------------------------------
function sanitizeCitationsModel(urls: string[]): string[] {
  return asArray(urls)
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
  const sluggedCandidates = candidates.map(toSlug);
  for (const cand of sluggedCandidates) {
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

// ----------------------------------------------------------------------------
// attachEvidence
// ----------------------------------------------------------------------------
function attachEvidence(item: StackItem): StackItem {
  const normName = normalizeSupplementName(item.name);
  const candidates = buildEvidenceCandidates(normName);

  const curatedUrls = lookupCuratedForCandidates(candidates, 3);
  const modelValid = sanitizeCitationsModel(item.citations ?? []);
  const final = curatedUrls.length ? curatedUrls : modelValid;

  try {
    console.log("evidence.lookup", {
      rawName: item.name,
      normName,
      candidates,
      curatedCount: curatedUrls.length,
      keptFromModel: modelValid.length,
    });
  } catch (e) {}

  // overwrite name with normalized display name
  return { ...item, name: normName, citations: final.length ? final : null };
}

// ----------------------------------------------------------------------------
// Evidence section rendering
// ----------------------------------------------------------------------------
function hostOf(u: string): string {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function labelForUrl(u: string): string {
  const h = hostOf(u);
  if (/pubmed\.ncbi\.nlm\.nih\.gov/i.test(h)) return "PubMed";
  if (/pmc\.ncbi\.nlm\.nih\.gov/i.test(h)) return "PMC";
  if (/doi\.org/i.test(h)) return "DOI";
  if (/jamanetwork\.com/i.test(h)) return "JAMA";
  if (/biomedcentral\.com|bmcpsychiatry\.biomedcentral\.com|dmsjournal\.biomedcentral\.com/i.test(h)) return "BMC";
  if (/journals\.plos\.org|plos\.org/i.test(h)) return "PLOS";
  if (/nature\.com/i.test(h)) return "Nature";
  if (/sciencedirect\.com/i.test(h)) return "ScienceDirect";
  if (/amjmed\.com/i.test(h)) return "Am J Med";
  if (/koreascience\.kr/i.test(h)) return "KoreaScience";
  if (/monash\.edu/i.test(h)) return "Monash";
  return h || "Source";
}

function buildEvidenceSection(items: StackItem[], minCount = 8): {
  section: string;
  bullets: Array<{ name: string; url: string }>;
} {
  const bullets: Array<{ name: string; url: string }> = [];

  for (const it of asArray(items)) {
    const citations = asArray(it.citations);
    for (const rawUrl of citations) {
      const url = (rawUrl || "").trim();
      const normalized = url.endsWith("/") ? url : url + "/";
      if (CURATED_CITE_RE.test(normalized) || MODEL_CITE_RE.test(normalized)) {
        bullets.push({ name: cleanName(it.name), url: normalized });
      }
    }
  }

  // Dedup
  const seen = new Set<string>();
  const unique = bullets.filter((b) => {
    if (seen.has(b.url)) return false;
    seen.add(b.url);
    return true;
  });

  // Pad to minCount
  const take =
    unique.length >= minCount
      ? unique
      : [
          ...unique,
          ...Array.from({ length: Math.max(0, minCount - unique.length) }).map(() => ({
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

// ----------------------------------------------------------------------------
// Shopping Links section rendering
// ----------------------------------------------------------------------------
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

  return `## Shopping Links\n\n${bullets.join(
    "\n"
  )}\n\n**Analysis**\n\nThese links are provided for convenience. Premium users may see Fullscript options when available; Amazon links are shown for everyone.`;
}

// ----------------------------------------------------------------------------
// Parser: Markdown → StackItem[]
// ----------------------------------------------------------------------------
function parseStackFromMarkdown(md: string): StackItem[] {
  const base: Record<string, any> = {};

  // 1) Your Blueprint Recommendations (table)
  const blueprint = md.match(/## Your Blueprint Recommendations([\s\S]*?)(\n## |$)/i);
  if (blueprint) {
    const rows = blueprint[1].split("\n").filter((l) => l.trim().startsWith("|"));
    rows.slice(1).forEach((row, i) => {
      const cols = row.split("|").map((c) => c.trim());
      const name = cleanName(cols[2] || `Item ${i + 1}`);
      if (!name) return;
      const key = name.toLowerCase();
      base[key] = {
        ...(base[key] ?? {}),
        name,
        rationale: cols[3] || (base[key]?.rationale ?? undefined),
        dose: base[key]?.dose ?? null,
        dose_parsed: base[key]?.dose_parsed ?? null,
        timing: base[key]?.timing ?? null,
        // normalize fields
        timing_bucket: base[key]?.timing_bucket ?? null,
        timing_text: base[key]?.timing_text ?? null,
        is_current: base[key]?.is_current ?? false,
      };
    });
  }

  // 2) Current Stack (table)
  const current = md.match(/## Current Stack([\s\S]*?)(\n## |$)/i);
  if (current) {
    const rows = current[1].split("\n").filter((l) => l.trim().startsWith("|"));
    rows.slice(1).forEach((row, i) => {
      const cols = row.split("|").map((c) => c.trim());
      const name = cleanName(cols[1] || `Current Item ${i + 1}`);
      if (!name) return;
      const rationale = cols[2] || undefined;
      const dose = cols[3] || null;
      const timingRaw = cols[4] || null;
      const timingNorm = normalizeTiming(timingRaw);
      const parsed = parseDose(dose);
      const key = name.toLowerCase();
  
      const tb = classifyTimingBucket(timingRaw);
  
      base[key] = {
        ...(base[key] ?? {}),
        name,
        rationale: base[key]?.rationale ?? rationale,
        dose: dose ?? base[key]?.dose ?? null,
        dose_parsed: parsed ?? base[key]?.dose_parsed ?? null,
        timing: timingNorm ?? base[key]?.timing ?? null,
        timing_text: timingRaw,                            // keep original
        timing_bucket: tb ?? base[key]?.timing_bucket ?? null,
        is_current: true,                                  // ← mark as current
      };
    });
  }


  // 3) Dosing & Notes (bulleted list)
  const dosing = md.match(/## Dosing & Notes([\s\S]*?)(\n## |\n## END|$)/i);
  if (dosing) {
    const lines = dosing[1].split("\n").filter((l) => l.trim().length > 0);
    for (const line of lines) {
      const m = line.match(/[-*]\s*([^—\-:]+)[—\-:]\s*([^,]+)(?:,\s*(.*))?/);
      if (m) {
        const name = cleanName(m[1].trim());
        if (!name) continue;
        const dose = m[2]?.trim() || null;
        const timingRaw = m[3] || null;
        const timingNorm = normalizeTiming(timingRaw);
        const parsed = parseDose(dose);
        const key = name.toLowerCase();
        const tb = classifyTimingBucket(timingRaw);
  
        base[key] = {
          ...(base[key] ?? {}),
          name,
          dose,
          dose_parsed: parsed,
          timing: timingNorm ?? base[key]?.timing ?? null,
          timing_text: timingRaw ?? base[key]?.timing_text ?? null,
          timing_bucket: tb ?? base[key]?.timing_bucket ?? null,
          rationale: base[key]?.rationale ?? undefined,
          is_current: base[key]?.is_current ?? false,
        };
      }
    }
  }


  const seen = new Set<string>();
  return Object.values(base).filter((it: any) => {
    if (!it?.name) return false;
    const key = it.name.trim().toLowerCase();
    if (!key) return false;
    if (seen.has(key)) return false;
    if (it.name.length > 40) return false;
    if (/[.,]{3,}/.test(it.name)) return false;
    if (/\bvitamin\b.*\band\b/i.test(it.name)) return false;
    if (/^analysis$/i.test(it.name.trim())) return false;
    seen.add(key);
    return true;
  });
}

// ----------------------------------------------------------------------------
// Prompts
// ----------------------------------------------------------------------------
function systemPrompt() {
  return `
You are **LVE360 Concierge AI**, a friendly but professional wellness coach.
Tone: encouraging, plain-English, never clinical or robotic.
Always explain *why it matters* in a supportive, human way.
Always greet the client by name in the Intro Summary if provided.

Return **plain ASCII Markdown only** with headings EXACTLY:

${HEADINGS.slice(0, -1).join("\n")}

Tables must use \`Column | Column\` pipe format, **no curly quotes or bullets**.
Every table/list MUST be followed by **Analysis** ≥${MIN_ANALYSIS_SENTENCES} sentences that:
• Summarize the section
• Explain why it matters
• Give practical implication

### Section-specific rules
• **Intro Summary** → Must greet by name (if available) and include ≥2–3 sentences.  
• **Goals** → Table: Goal | Description, followed by Analysis.  
• **Current Stack** → Table: Medication/Supplement | Purpose | Dosage | Timing, followed by Analysis.  
• **Your Blueprint Recommendations** → 3-column table: Rank | Supplement | Why it Matters.  
  Must include ≥${MIN_BP_ROWS} unique rows.  
  If fewer than ${MIN_BP_ROWS}, regenerate until quota met.  
  Add: *“See Dosing & Notes for amounts and timing.”*  
  Follow with 3–5 sentence Analysis.  
• **Dosing & Notes** → List + Analysis explaining amounts, timing, and safety notes.  
• **Evidence & References** → At least 8 bullet points with PubMed/DOI URLs, followed by Analysis.  
• **Shopping Links** → Provide links + Analysis.  
• **Follow-up Plan** → At least 3 checkpoints + Analysis.  
• **Lifestyle Prescriptions** → ≥3 actionable changes + Analysis.  
• **Longevity Levers** → ≥3 strategies + Analysis.  
• **This Week Try** → Exactly 3 micro-habits + Analysis.  
• If Dose/Timing unknown → use “${seeDN}”.  
• Finish with line \`## END\`.  

If internal check fails, regenerate before responding.`;
}

function userPrompt(sub: SubmissionWithChildren) {
  return `
### CLIENT
\`\`\`json
${JSON.stringify(
  { ...sub, age: age((sub as any).dob ?? null), today: TODAY },
  null,
  2
)}
\`\`\`

### TASK
Generate the full report per the rules above.`;
}


// ----------------------------------------------------------------------------
// LLM wrapper (delegates to src/lib/openai.ts)
// ----------------------------------------------------------------------------
type LLMOptions = { temperature?: number; maxTokens?: number; mode?: "free" | "premium" };
type LLMReturn = { text: string; modelUsed?: string; promptTokens?: number; completionTokens?: number };

async function callLLM(model: string, messages: any[], opts: LLMOptions = {}): Promise<LLMReturn> {
  // openai.ts signature: callLLM(messages, model, { max?, maxTokens?, temperature? })
  const resp = await callOpenAI(messages, model, {
    max: opts.maxTokens,          // prefer `max` (openai.ts normalizes)
    maxTokens: opts.maxTokens,    // legacy alias (harmless)
    temperature: opts.temperature,
  });

  const text = (resp?.choices?.[0]?.message?.content ?? "").trim();
  return {
    text,
    modelUsed: resp?.model,
promptTokens: resp?.usage?.prompt_tokens,
completionTokens: resp?.usage?.completion_tokens,

  };
}

async function callWithRetry<T>(fn: () => Promise<T>, retries = 2): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err: any) {
      const code = Number(err?.status || err?.code || 0);
      const retriable = [408, 429, 500, 502, 503, 504];
      if (attempt >= retries || !retriable.includes(code)) throw err;
      const delay = (250 + Math.random() * 500) * (attempt + 1);
      await new Promise((r) => setTimeout(r, delay));
      attempt++;
    }
  }
}

// ----------------------------------------------------------------------------
// Validation helpers
// ----------------------------------------------------------------------------

function headingsOK(md: string) {
  return HEADINGS.slice(0, -1).every((h) => (md || "").includes(h));
}

function sectionChunk(md: string, header: string) {
  const re = new RegExp(`${header}([\\s\\S]*?)(?=\\n## |\\n## END|$)`, "i");
  const m = (md || "").match(re);
  return m ? m[1] : "";
}

function blueprintOK(md: string, minRows: number) {
  const body = sectionChunk(md, "## Your Blueprint Recommendations");
  if (!body) return false;

  // table lines only
  const tableLines = body.split("\n").filter((l) => l.trim().startsWith("|"));
  if (tableLines.length < 3) return false; // need header + separator + >=1 row

  // drop header + separator lines
  const dataLines = tableLines.slice(2).filter((l) => /\S/.test(l));
  return dataLines.length >= minRows;
}

function citationsOK(md: string) {
  const body = sectionChunk(md, "## Evidence & References");
  if (!body) return false;

  // collect URLs inside (...) Markdown links
  const urls = Array.from(body.matchAll(/\((https?:\/\/[^\s)]+)\)/g)).map((m) => m[1]);
  const valid = urls.filter((u) => CURATED_CITE_RE.test(u) || MODEL_CITE_RE.test(u));
  return valid.length >= 8;
}

function narrativesOK(md: string, minSent: number) {
  const sections = (md || "").split("\n## ").slice(1);
  return sections.every((sec) => {
    const name = sec.split("\n", 1)[0] || "";
    const lines = sec.split("\n");
    const textBlock = lines
      .filter((l) => !l.startsWith("|") && !l.trim().startsWith("-"))
      .join(" ");

    const sentences = textBlock
      .split(/[.!?](?:\s|$)/)
      .map((s) => s.trim())
      .filter(Boolean);

    if (/^Intro Summary/i.test(name)) return sentences.length >= 2;
    return sentences.length >= minSent;
  });
}
function ensureEnd(md: string) {
  return hasEnd(md) ? md : (md || "") + "\n\n## END";
}
// --- Mode-aware validation targets ------------------------------------------
function computeValidationTargets(mode: "free" | "premium", cap?: number) {
  // Free can be shorter and have fewer rows; Premium keeps strict targets.
  // If cap is undefined (no cap), use Free defaults that don’t depend on cap.
  const minWords = mode === "premium" ? 1800 : 900;
  const minRows  = mode === "premium" ? 10   : 3;                 // Free requires at least 3 rows
  const minSent  = mode === "premium" ? 3    : 2;                 // Free allows 2-sentence analyses
  // If you *do* pass a cap, keep "at most the cap" for Free (never >3 min).
  return cap != null
    ? { minWords, minRows: Math.min(3, cap || 3), minSent }
    : { minWords, minRows, minSent };
}

// ----------------------------------------------------------------------------
// Preference → Amazon category chooser, plus Premium Fullscript preference
// ----------------------------------------------------------------------------
function normalizeBrandPref(p?: string | null): "budget" | "trusted" | "clean" | "default" {
  const s = (p || "").toLowerCase();
  if (s.includes("budget") || s.includes("cost")) return "budget";
  if (s.includes("trusted") || s.includes("brand")) return "trusted";
  if (s.includes("clean")) return "clean";
  return "default"; // “doesn’t matter”
}

function chooseAmazonLinkFor(item: StackItem, pref: "budget" | "trusted" | "clean" | "default"): string | null {
  const pick =
    pref === "budget" ? item.link_budget
    : pref === "trusted" ? item.link_trusted
    : pref === "clean" ? item.link_clean
    : item.link_default;

  // Robust fallbacks
  return (
    pick ||
    item.link_default ||
    item.link_trusted ||
    item.link_budget ||
    item.link_clean ||
    buildAmazonSearchLink(item.name, item.dose) ||
    null
  );
}

function applyLinkPolicy(items: StackItem[], sub: any, mode: GenerateMode): StackItem[] {
  const pref = normalizeBrandPref(
    sub?.preferences?.brand_pref ??
    sub?.brand_pref ??
    null
  );

  // Options.mode overrides submission flags (route is source of truth)
  const isPremium = mode === "premium" ||
    Boolean(sub?.is_premium) ||
    Boolean(sub?.user?.is_premium) ||
    (sub?.plan === "premium");

  return asArray(items).map((it) => {
    const linkAmazon = chooseAmazonLinkFor(it, pref);
    const linkFS = it.link_fullscript ?? null;

    // Premium policy: prefer Fullscript if available, but still keep Amazon set
    if (isPremium && linkFS) {
      return { ...it, link_amazon: linkAmazon, link_fullscript: linkFS };
    }
    // Not premium or no FS link available → keep Amazon only
    return { ...it, link_amazon: linkAmazon };
  });
}

// ----------------------------------------------------------------------------
// Main Export
// ----------------------------------------------------------------------------
export async function generateStackForSubmission(
  id: string,
  options?: GenerateOptions
) {
  if (!id) throw new Error("submissionId required");
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY missing");

  // Tier + cap (route passes options; fall back to submission flags)
  const modeFromOpts: GenerateMode | undefined = options?.mode;
  const requestedCap = typeof options?.maxItems === "number" ? clamp(options.maxItems, 1, 20) : undefined;

  const sub = await getSubmissionWithChildren(id);
  if (!sub) throw new Error(`Submission row not found for id=${id}`);

  const inferredPremium =
    Boolean((sub as any)?.is_premium) ||
    Boolean((sub as any)?.user?.is_premium) ||
    ((sub as any)?.plan === "premium");

  const mode: GenerateMode = modeFromOpts ?? (inferredPremium ? "premium" : "free");
  // Only cap if the caller explicitly provided maxItems.
  // Otherwise, do not cap (return all items).
  const cap = requestedCap; // may be undefined


  const user_id = extractUserId(sub);
  const userEmail =
    (sub as any)?.user?.email ??
    (sub as any)?.user_email ??
    (sub as any)?.email ??
    null;

  const msgs: ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt() },
    { role: "user", content: userPrompt(sub) },
  ];

  let md = "";
  let llmRaw: any = null;
  let modelUsed = "unknown";
  let tokensUsed: number | null = null;
  let promptTokens: number | null = null;
  let completionTokens: number | null = null;
  let passes = false;

  // ----- First attempt (faster model) ---------------------------------------
  try {
    const resp = await callLLM("gpt-5-mini", msgs);
    llmRaw = resp;
modelUsed = resp.modelUsed ?? "gpt-5-mini";
tokensUsed = ((resp.promptTokens ?? 0) + (resp.completionTokens ?? 0)) || null;
promptTokens = resp.promptTokens ?? null;
completionTokens = resp.completionTokens ?? null;

md = resp.text ?? "";
console.log("[generateStack] modelUsed =", resp.modelUsed ?? "<unknown>");


    // Validation
const targets = computeValidationTargets(mode, cap);
const wordCountOK    = wc(md) >= targets.minWords;
const headingsValid  = headingsOK(md);
const blueprintValid = blueprintOK(md, targets.minRows);
const citationsValid = citationsOK(md);
const narrativesValid= narrativesOK(md, targets.minSent);
const endValid       = hasEnd(md);

console.log("validation.debug", {
  wordCountOK,
  headingsValid,
  blueprintValid,
  citationsValid,
  narrativesValid,
  endValid,
  actualWordCount: wc(md),
});
console.info("validation.targets", targets);


    if (wordCountOK && headingsValid && blueprintValid && citationsValid && narrativesValid && endValid) {
      passes = true;
    }
  } catch (err) {
    console.warn("Mini model failed:", err);
  }

  // ----- Fallback attempt (stronger model) ----------------------------------
  if (!passes) {
    try {
      const resp = await callLLM("gpt-5", msgs);
      llmRaw = resp;
      modelUsed = resp.modelUsed ?? "gpt-5";
      tokensUsed = ((resp.promptTokens ?? 0) + (resp.completionTokens ?? 0)) || null;
      promptTokens = resp.promptTokens ?? null;
      completionTokens = resp.completionTokens ?? null;
      md = resp.text ?? "";
    } catch (err) {
      console.warn("Fallback model failed:", err);
    }

const targets = computeValidationTargets(mode, cap);
const wordCountOK    = wc(md) >= targets.minWords;
const headingsValid  = headingsOK(md);
const blueprintValid = blueprintOK(md, targets.minRows);
const citationsValid = citationsOK(md);
const narrativesValid= narrativesOK(md, targets.minSent);
const endValid       = hasEnd(md);

console.log("validation.debug", {
  wordCountOK,
  headingsValid,
  blueprintValid,
  citationsValid,
  narrativesValid,
  endValid,
  actualWordCount: wc(md),
});


    if (wordCountOK && headingsValid && blueprintValid && citationsValid && narrativesValid && endValid) {
      passes = true;
    }
  }

  md = ensureEnd(md);
  
  // --- Remove non-supplement "timing" artifacts that slipped out of Dosing & Notes
const TIMING_ARTIFACT_RE = /^(on\s+waking|am\b.*breakfast|evening\b.*dinner|before\s+bed|pre[- ]?exercise(?:.*)?|hold\/adjust|simplify\s+sleep\s+aids)$/i;

function looksLikeTimingArtifact(name?: string | null) {
  const s = (name || "").trim();
  if (!s) return false;
  // reject generic time-of-day phrases; keep real products like “R-ALA 300 mg” and “Niacin 500 mg”
  return TIMING_ARTIFACT_RE.test(s);
}

// --- Parse items from Markdown --------------------------------------------
const parsedItems = parseMarkdownToItems(md);

// --- Tier cap (Free vs Premium) BEFORE safety/enrichment -------------------
// Only cap if maxItems was provided. Otherwise, keep ALL items.
const rawCapped = typeof cap === "number"
  ? asArray(parsedItems).slice(0, cap)
  : asArray(parsedItems);

// Coerce shapes to StackItem (no null in is_current)
const baseItems: StackItem[] = rawCapped.map((i: any) => ({
  ...i,
  is_current: i?.is_current === true, // null/undefined -> false
}));

const filteredItems: StackItem[] = baseItems.filter(
  (it) => it?.name && !looksLikeTimingArtifact(it.name)
);
  
  type SafetyStatus = "safe" | "warning" | "error";
  interface SafetyOutput {
    cleaned: StackItem[];
    status: SafetyStatus;
  }
  
  function coerceSafetyStatus(s: any): SafetyStatus {
    return s === "safe" ? "safe" : s === "error" ? "error" : "warning";
  }

  // --- Safety checks (deep) --------------------------------------------------
  const safetyInput = { /* keep your existing fields exactly */ 
    medications: Array.isArray((sub as any).medications)
      ? (sub as any).medications.map((m: any) => m.med_name || "")
      : [],
    conditions: Array.isArray((sub as any).conditions)
      ? (sub as any).conditions.map((c: any) => c.condition_name || "")
      : [],
    allergies: Array.isArray((sub as any).allergies)
      ? (sub as any).allergies.map((a: any) => a.allergy_name || "")
      : [],
    pregnant:
      typeof (sub as any).pregnant === "boolean" ||
      typeof (sub as any).pregnant === "string"
        ? (sub as any).pregnant
        : null,
    brand_pref: (sub as any)?.preferences?.brand_pref ?? null,
    dosing_pref: (sub as any)?.preferences?.dosing_pref ?? null,
    is_premium: mode === "premium",
  };
  
  let safetyStatus: SafetyStatus = "warning";
  let cleanedItems: StackItem[] = filteredItems;
  
  try {
    const res = (await applySafetyChecks(safetyInput, filteredItems)) as Partial<SafetyOutput> | null;
    cleanedItems = asArray<StackItem>((res?.cleaned as StackItem[]) ?? filteredItems);
    safetyStatus = coerceSafetyStatus(res?.status);
  } catch (e) {
    console.warn("applySafetyChecks failed; continuing with uncautioned items.", e);
  }
  
  // Normalize names before enrichment so aliases resolve correctly (no spread on unknown)
  const normalizedForLinks: StackItem[] = cleanedItems.map((it) => {
    const copy: StackItem = { ...it };
    copy.name = normalizeSupplementName(copy.name ?? "");
    return copy;
  });


  // Enrich with links (expects to fill link_budget/trusted/clean/default and possibly link_fullscript)
  const enriched = await (async () => {
    try {
      const r = await enrichAffiliateLinks(normalizedForLinks);
      return asArray(r);
    } catch (e) {
      console.warn("enrichAffiliateLinks failed; skipping enrichment.", e);
      return normalizedForLinks;
    }
  })();

  // Apply link policy: pick Amazon category from quiz, prefer Fullscript for premium
  const finalStack: StackItem[] = applyLinkPolicy(enriched, sub, mode);

  // Evidence attach (curate + sanitize) — make sure this sits BEFORE buildEvidenceSection(...)
const withEvidence: StackItem[] = asArray(finalStack).map(attachEvidence);

  // Override evidence section in markdown
  const { section: evidenceSection } = buildEvidenceSection(withEvidence, 8);
  md = overrideEvidenceInMarkdown(md, evidenceSection);

  // Shopping Links section in markdown
  const shoppingSection = buildShoppingLinksSection(withEvidence);
  const shoppingRe = /## Shopping Links([\s\S]*?)(?=\n## |\n## END|$)/i;
  if (shoppingRe.test(md)) {
    md = md.replace(shoppingRe, shoppingSection);
  } else {
    md = md.replace(/\n## END/i, `\n\n${shoppingSection}\n\n## END`);
  }

  // Total monthly cost estimate (best-effort)
  const totalMonthlyCost = asArray(withEvidence).reduce((acc, it) => acc + (it?.cost_estimate ?? 0), 0);

// ---------------------------------------------------------------------------
// Persist parent stack (single source of truth for stackId)
// ---------------------------------------------------------------------------
let parentRows: any[] = [];
let stackId: string | null = null;
let stackRow: any = null;

try {
  const { data, error } = await supabaseAdmin
    .from("stacks")
    .upsert(
      {
        submission_id: id,
        user_id,
        user_email: userEmail,
        tally_submission_id: (sub as any)?.tally_submission_id ?? null,
        version: modelUsed,
        tokens_used: tokensUsed,
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        safety_status: safetyStatus, // keep your existing variable
        summary: md,
        sections: {
          markdown: md,
          generated_at: new Date().toISOString(),
          mode,                 // analytics
          item_cap: cap ?? null // analytics
        },
        notes: null,
        total_monthly_cost: totalMonthlyCost,
      },
      { onConflict: "submission_id" }
    )
    .select();

  if (error) {
    console.error("Supabase upsert error:", error);
  }
  if (data && data.length > 0 && data[0]?.id) {
    parentRows = data;
    stackRow = data[0];
    stackId = String(data[0].id);
  }
} catch (err) {
  console.error("Stacks upsert exception:", err);
}

// ---------------------------------------------------------------------------
// Persist items (delete → rebuild → insert) for this stack
// ---------------------------------------------------------------------------
if (parentRows.length > 0 && stackId && user_id) {
  try {
    // 1) Clear existing items for this stack
    await supabaseAdmin.from("stacks_items").delete().eq("stack_id", stackId);

    // 2) Row shape for insert
    type StackItemRow = {
      stack_id: string;
      user_id: string;
      user_email: string | null;
      name: string;
      dose: string | null;
      timing: string | null;
      notes: string | null;
      rationale: string | null;
      caution: string | null;
      citations: string | null;
      link_amazon: string | null;
      link_fullscript: string | null;
      link_thorne: string | null;
      link_other: string | null;
      cost_estimate: number | null;
      is_current: boolean | null;
      timing_bucket: string | null;
      timing_text: string | null;
    };

    // 3) Build rows from normalized/enriched items
    const rows: StackItemRow[] = (withEvidence || [])
      .map((it) => {
        const normName = normalizeSupplementName(it?.name ?? "");
        const safeName = cleanName(normName);
        if (!safeName || safeName.toLowerCase() === "null") {
          console.error("🚨 Blocking insert of invalid item", {
            stack_id: stackId,
            user_id,
            rawName: it?.name,
          });
          return null;
        }

        const citations = Array.isArray(it.citations)
          ? JSON.stringify(it.citations)
          : null;

        const timingText = (it as any).timing_text ?? it.timing ?? null;
        const bucket =
          (it as any).timing_bucket ?? classifyTimingBucket(timingText);

        const row: StackItemRow = {
          stack_id: stackId,
          user_id,
          user_email: userEmail,
          name: safeName,
          dose: it.dose ?? null,
          timing: it.timing ?? null,
          notes: it.notes ?? null,
          rationale: it.rationale ?? null,
          caution: it.caution ?? null,
          citations,
          link_amazon: it.link_amazon ?? null,
          link_fullscript: it.link_fullscript ?? null,
          link_thorne: it.link_thorne ?? null,
          link_other: it.link_other ?? null,
          cost_estimate: it.cost_estimate ?? null,
          is_current: Boolean((it as any).is_current ?? false),
          timing_bucket: bucket ?? null,
          timing_text: timingText,
        };

        return row;
      })
      .filter((r): r is StackItemRow => r !== null);

    // 4) Insert if we have rows
    if (rows.length > 0) {
      const { error } = await supabaseAdmin.from("stacks_items").insert(rows);
      if (error) {
        console.error("⚠️ Failed to insert stacks_items:", error);
      } else {
        console.log(`✅ Inserted ${rows.length} stack items for stack ${stackId}`);
      }
    }
  } catch (e) {
    console.warn("⚠️ stacks_items write failed:", e);
  }
}

if (!passes) {
  console.warn("⚠️ Draft validation failed, review needed.");
}

// Return original telemetry AND add stack_id for the API route
const raw = {
  ...(llmRaw ?? {}),
  stack_id: stackId ?? undefined,
  safety_status: safetyStatus,
  mode,
  item_cap: cap,
};

return {
  markdown: md,
  raw,
  model_used: modelUsed,
  tokens_used: tokensUsed,
  prompt_tokens: promptTokens,
  completion_tokens: completionTokens,
};
}

export default generateStackForSubmission;
