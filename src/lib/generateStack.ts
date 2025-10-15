/* eslint-disable @typescript-eslint/consistent-type-imports */
/* eslint-disable no-console */
// ---------------------------------------------------------------------------
// LVE360 — generateStack.ts  (bulletproof)
// ---------------------------------------------------------------------------
// Goals
//  - Generate Markdown with strict headings
//  - Never throw: always return markdown (LLM→fallback LLM→skeleton)
//  - Parse items from Markdown; if none, backfill from submission_supplements
//  - Run safety, affiliate enrichment, evidence & shopping overrides
//  - Persist parent stack + child stacks_items (always)
//  - Return validation object your /api/generate-stack route expects
// ---------------------------------------------------------------------------

import getSubmissionWithChildren from "@/lib/getSubmissionWithChildren";
import type { SubmissionWithChildren } from "@/lib/getSubmissionWithChildren";

import { ChatCompletionMessageParam } from "openai/resources";

import { applySafetyChecks } from "@/lib/safetyCheck";
import { enrichAffiliateLinks } from "@/lib/affiliateLinks";
import { getTopCitationsFor } from "@/lib/evidence";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Ships in repo; adjust path if different
import evidenceIndex from "@/evidence/evidence_index_top3.json";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const TODAY = "2025-09-21"; // deterministic for logs/tests
const MIN_WORDS = 1800;      // goal, not hard failure
const MIN_BP_ROWS = 10;
const MIN_ANALYSIS_SENTENCES = 3;

const MODEL_MINI = "gpt-4o-mini";
const MODEL_FULL = "gpt-4o";

// Strict model-allowed refs (what we expect the model to emit)
const MODEL_CITE_RE =
  /\bhttps?:\/\/(?:pubmed\.ncbi\.nlm\.nih\.gov\/\d+\/?|doi\.org\/\S+)\b/;

// Broader curated refs accepted when we override Evidence section
const CURATED_CITE_RE =
  /\bhttps?:\/\/(?:pubmed\.ncbi\.nlm\.nih\.gov\/\d+\/?|pmc\.ncbi\.nlm\.nih\.gov\/articles\/\S+|doi\.org\/\S+|jamanetwork\.com\/\S+|biomedcentral\.com\/\S+|bmcpsychiatry\.biomedcentral\.com\/\S+|journals\.plos\.org\/\S+|nature\.com\/\S+|sciencedirect\.com\/\S+|amjmed\.com\/\S+|koreascience\.kr\/\S+|dmsjournal\.biomedcentral\.com\/\S+|researchmgt\.monash\.edu\/\S+)\b/i;

// Markdown headings contract (order matters)
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
] as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface StackItem {
  name: string;
  dose?: string | null;
  dose_parsed?: { amount?: number; unit?: string };
  timing?: string | null;
  rationale?: string | null;
  notes?: string | null;
  caution?: string | null;
  citations?: string[] | null;

  // Provided by enrichment
  link_budget?: string | null;
  link_trusted?: string | null;
  link_clean?: string | null;
  link_default?: string | null;

  // Persisted destination links
  link_amazon?: string | null;
  link_fullscript?: string | null;
  link_thorne?: string | null;
  link_other?: string | null;

  cost_estimate?: number | null;
}

type StackItemInsert = {
  stack_id: string;
  user_id: string | null; // schema allows null
  user_email: string | null;
  name: string;
  brand?: string | null;
  dose: string | null;
  timing: string | null;
  notes: string | null;
  rationale: string | null;
  caution: string | null;
  citations: string[] | null; // jsonb
  link_amazon: string | null;
  link_fullscript: string | null;
  link_thorne: string | null;
  link_other: string | null;
  cost_estimate: number | null;
};

interface EvidenceEntry {
  url?: string | null;
  [key: string]: any;
}
type EvidenceIndex = Record<string, EvidenceEntry[]>;
const EVIDENCE: EvidenceIndex = evidenceIndex as unknown as EvidenceIndex;

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------
const wc = (t: string) => t.trim().split(/\s+/).length;
const hasEnd = (t: string) => /(^|\n)## END\s*$/i.test(t.trim());
const seeDN = "See Dosing & Notes";

function sanitizeMarkdown(md: string): string {
  if (!md) return "";
  let s = md;
  // strip a single leading code fence and trailing fence if present
  s = s.replace(/^```[a-z]*\n/i, "").replace(/```$/i, "");
  // collapse >2 blank lines
  s = s.replace(/\n{3,}/g, "\n\n");
  // ensure END only once
  const firstEnd = s.indexOf("\n## END");
  if (firstEnd !== -1) s = s.slice(0, firstEnd) + "\n## END";
  return s.trim();
}

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
  const num = cleaned.match(/(\d+(?:\.\d+)?)/g);
  if (!num) return {};
  const amount = parseFloat(num[num.length - 1]);
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

// ---------------------------------------------------------------------------
// Name normalization + aliasing for evidence lookup
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Evidence helpers & override
// ---------------------------------------------------------------------------
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
  const sluggedCandidates = candidates.map(toSlug);
  for (const cand of sluggedCandidates) {
    for (const jsonKey of Object.keys(EVIDENCE)) {
      const slugKey = toSlug(jsonKey);
      if (slugKey.includes(cand) || cand.includes(slugKey)) {
        const hits = getTopCitationsFromJson(jsonKey, limit);
        if (hits.length) {
          try {
            console.log("evidence.fuzzy_match", { cand, jsonKey, hits });
          } catch {}
          return hits;
        }
      }
    }
  }
  return [];
}

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
      curatedCount: curatedUrls.length,
      keptFromModel: modelValid.length,
    });
  } catch {}

  return { ...item, name: normName, citations: final.length ? final : null };
}

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

These references come from LVE360’s curated evidence index (PubMed/PMC/DOI and trusted journals) and replace any model-generated references.
`;
  const section = `## Evidence & References\n\n${bulletsText}${analysis}`;
  return { section, bullets: take };
}

function overrideEvidenceInMarkdown(md: string, section: string): string {
  const headerRe = /## Evidence & References([\s\S]*?)(?=\n## |\n## END|$)/i;
  if (headerRe.test(md)) return md.replace(headerRe, section);
  return md.replace(/\n## END/i, `\n\n${section}\n\n## END`);
}

// ---------------------------------------------------------------------------
// Shopping Links section
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Parser: Markdown → StackItem[]
// ---------------------------------------------------------------------------
function parseStackFromMarkdown(md: string): StackItem[] {
  const base: Record<string, any> = {};

  // 1) Your Blueprint Recommendations (table)
  const blueprint = md.match(/## Your Blueprint Recommendations([\s\S]*?)(\n## |\n## END|$)/i);
  if (blueprint) {
    const rows = blueprint[1].split("\n").filter((l) => l.trim().startsWith("|"));
    rows.slice(1).forEach((row, i) => {
      const cols = row.split("|").map((c) => c.trim());
      const name = cleanName(cols[2] || `Item ${i + 1}`);
      if (!name) return;
      base[name.toLowerCase()] = {
        name,
        rationale: cols[3] || undefined,
        dose: null,
        dose_parsed: null,
        timing: null,
      };
    });
  }

  // 2) Current Stack (table)
  const current = md.match(/## Current Stack([\s\S]*?)(\n## |\n## END|$)/i);
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
        base[key] = {
          name,
          rationale,
          dose,
          dose_parsed: parsed,
          timing,
        };
      }
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
        const timing = normalizeTiming(m[3]);
        const parsed = parseDose(dose);
        const key = name.toLowerCase();
        if (base[key]) {
          base[key].dose = dose;
          base[key].dose_parsed = parsed;
          base[key].timing = timing;
        } else {
          base[key] = {
            name,
            rationale: undefined,
            dose,
            dose_parsed: parsed,
            timing,
          };
        }
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

// ---------------------------------------------------------------------------
// Prompts & LLM
// ---------------------------------------------------------------------------
function systemPrompt() {
  return `
You are **LVE360 Concierge AI**, a friendly but professional wellness coach.
Tone: encouraging, plain-English, never clinical or robotic.
Always explain *why it matters* in a supportive, human way.
Always greet the client by name in the Intro Summary if provided.

Return **plain ASCII Markdown only** with headings EXACTLY:

${HEADINGS.slice(0, -1).join("\n")}

Tables must use \`Column | Column\` pipe format (no bullets inside tables).
Every table/list MUST be followed by **Analysis** with ≥${MIN_ANALYSIS_SENTENCES} sentences that:
• Summarize the section
• Explain why it matters
• Give practical implication

### Section-specific rules
• **Intro Summary** → Must greet by name (if available) and include ≥2–3 sentences.  
• **Goals** → Table: Goal | Description, plus Analysis.  
• **Current Stack** → Table: Medication/Supplement | Purpose | Dosage | Timing, plus Analysis.  
• **Your Blueprint Recommendations** → 3-column table: Rank | Supplement | Why it Matters.  
  Must include ≥${MIN_BP_ROWS} unique rows.  
  Add: *“See Dosing & Notes for amounts and timing.”*  
  Follow with 3–5 sentence Analysis.  
• **Dosing & Notes** → Bulleted list + Analysis explaining amounts, timing, and safety notes.  
• **Evidence & References** → At least 8 bullet points with PubMed/DOI URLs, followed by Analysis.  
• **Shopping Links** → Provide links + Analysis.  
• **Follow-up Plan** → At least 3 checkpoints + Analysis.  
• **Lifestyle Prescriptions** → ≥3 actionable changes + Analysis.  
• **Longevity Levers** → ≥3 strategies + Analysis.  
• **This Week Try** → Exactly 3 micro-habits + Analysis.  
• If Dose/Timing unknown → use “${seeDN}”.  
• Finish with line \`## END\`.  

If your internal check fails, regenerate before responding.`;
}

function userPrompt(sub: SubmissionWithChildren) {
  return `
### CLIENT
\`\`\`json
${JSON.stringify({ ...sub, age: age((sub as any).dob ?? null), today: TODAY }, null, 2)}
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

// ---------------------------------------------------------------------------
// Validation helpers (for logging & scoring; never hard-fail)
// ---------------------------------------------------------------------------
function headingsOK(md: string) {
  return HEADINGS.slice(0, -1).every((h) => md.includes(h));
}
function blueprintOK(md: string) {
  const sec = md.match(/## Your Blueprint Recommendations([\s\S]*?)(\n## |\n## END|$)/i);
  if (!sec) return false;
  const rows = sec[1].split("\n").filter((l) => l.trim().startsWith("|")).slice(1);
  return rows.length >= MIN_BP_ROWS;
}
function citationsOK(md: string) {
  const block = md.match(/## Evidence & References([\s\S]*?)(\n## |\n## END|$)/i);
  if (!block) return false;
  const bulletLines = block[1].split("\n").filter((l) => l.trim().startsWith("-"));
  if (bulletLines.length < 8) return false;
  // strict check of model-emitted links (we will override later anyway)
  return bulletLines.every((l) => MODEL_CITE_RE.test(l));
}
function narrativesOK(md: string) {
  const sections = md.split("\n## ").slice(1);
  return sections.every((sec) => {
    const lines = sec.split("\n");
    const textBlock = lines
      .filter((l) => !l.startsWith("|") && !l.trim().startsWith("-"))
      .join(" ");
    const sentences = textBlock
      .split(/[.!?]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (sec.startsWith("Intro Summary") && sentences.length < 2) return false;
    if (!sec.startsWith("Intro Summary") && sentences.length < MIN_ANALYSIS_SENTENCES) return false;
    return true;
  });
}
function ensureEnd(md: string) {
  return hasEnd(md) ? md : md + "\n\n## END";
}

function computeValidation(md: string) {
  const wordCountOK = wc(md) >= MIN_WORDS;
  const headingsValid = headingsOK(md);
  const blueprintValid = blueprintOK(md);
  const citationsValid = citationsOK(md);
  const narrativesValid = narrativesOK(md);
  const endValid = hasEnd(md);
  const ok = wordCountOK && headingsValid && blueprintValid && citationsValid && narrativesValid && endValid;
  return {
    wordCountOK,
    headingsValid,
    blueprintValid,
    citationsValid,
    narrativesValid,
    endValid,
    actualWordCount: wc(md),
    ok,
  };
}

// ---------------------------------------------------------------------------
// Skeleton fallback (never fails the pipeline)
// ---------------------------------------------------------------------------
function skeletonMarkdown(sub: any): string {
  const who =
    (sub?.name || sub?.user?.name || sub?.user?.email || "there") as string;

  return [
    "## Intro Summary",
    `Hi ${who}, this is a draft fallback while the AI engine was busy. You'll still see dosing, links and safety once we complete enrichment.`,
    "",
    "## Goals",
    "| Goal | Description |",
    "| --- | --- |",
    "| Energy | Improve day-long energy and focus |",
    "",
    "## Contraindications & Med Interactions",
    "- Will be checked against your meds/conditions in this draft.",
    "",
    "## Current Stack",
    "| Medication/Supplement | Purpose | Dosage | Timing |",
    "| --- | --- | --- | --- |",
    "",
    "## Your Blueprint Recommendations",
    "| Rank | Supplement | Why it Matters |",
    "| --- | --- | --- |",
    "| 1 | Omega-3 | See Dosing & Notes |",
    "| 2 | Magnesium | See Dosing & Notes |",
    "| 3 | Vitamin D | See Dosing & Notes |",
    "| 4 | Zinc | See Dosing & Notes |",
    "| 5 | B-Vitamins | See Dosing & Notes |",
    "| 6 | Rhodiola Rosea | See Dosing & Notes |",
    "| 7 | L-Theanine | See Dosing & Notes |",
    "| 8 | Ashwagandha | See Dosing & Notes |",
    "| 9 | CoQ10 | See Dosing & Notes |",
    "| 10 | Ginkgo Biloba | See Dosing & Notes |",
    "",
    "See Dosing & Notes for amounts and timing.",
    "",
    "## Dosing & Notes",
    "- Omega-3 — 1-2 g EPA+DHA/day, AM/PM",
    "- Magnesium — 200–400 mg, PM",
    "- Vitamin D — 2000 IU, AM",
    "",
    "## Evidence & References",
    "- Evidence pending: [DOI](https://doi.org/10.0000/example/)",
    "- Evidence pending: [PubMed](https://pubmed.ncbi.nlm.nih.gov/1/)",
    "- Evidence pending: [PubMed](https://pubmed.ncbi.nlm.nih.gov/2/)",
    "- Evidence pending: [PubMed](https://pubmed.ncbi.nlm.nih.gov/3/)",
    "- Evidence pending: [PubMed](https://pubmed.ncbi.nlm.nih.gov/4/)",
    "- Evidence pending: [PubMed](https://pubmed.ncbi.nlm.nih.gov/5/)",
    "- Evidence pending: [PubMed](https://pubmed.ncbi.nlm.nih.gov/6/)",
    "- Evidence pending: [PubMed](https://pubmed.ncbi.nlm.nih.gov/7/)",
    "",
    "**Analysis**",
    "These placeholders are replaced by curated references once generation succeeds.",
    "",
    "## Shopping Links",
    "- Placeholder — links attach after enrichment.",
    "",
    "**Analysis**",
    "Links are added for convenience and do not constitute endorsements.",
    "",
    "## Follow-up Plan",
    "- Check back in 2 weeks to review adherence and effects.",
    "",
    "**Analysis**",
    "Follow-ups help adjust dosing and ensure safety.",
    "",
    "## Lifestyle Prescriptions",
    "- Walk 10–15 min after meals",
    "- Protein at breakfast",
    "- Lights-out cadence at night",
    "",
    "**Analysis**",
    "Small daily habits create compounding benefits.",
    "",
    "## Longevity Levers",
    "- Sleep regularity",
    "- VO₂/zone-2 work",
    "- Strength 2–3×/wk",
    "",
    "**Analysis**",
    "Foundational levers drive most of the results.",
    "",
    "## This Week Try",
    "- 10-minute post-dinner walk",
    "- 2 liters water per day",
    "- 5-minute breathwork on waking",
    "",
    "**Analysis**",
    "Keep it simple and consistent.",
    "",
    "## END",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Preference → link policy
// ---------------------------------------------------------------------------
function normalizeBrandPref(p?: string | null): "budget" | "trusted" | "clean" | "default" {
  const s = (p || "").toLowerCase();
  if (s.includes("budget") || s.includes("cost")) return "budget";
  if (s.includes("trusted") || s.includes("brand")) return "trusted";
  if (s.includes("clean")) return "clean";
  return "default";
}
function chooseAmazonLinkFor(
  item: StackItem,
  pref: "budget" | "trusted" | "clean" | "default"
): string | null {
  const pick =
    pref === "budget" ? item.link_budget
    : pref === "trusted" ? item.link_trusted
    : pref === "clean" ? item.link_clean
    : item.link_default;
  return pick || item.link_default || item.link_trusted || item.link_budget || item.link_clean || null;
}
function applyLinkPolicy(items: StackItem[], sub: any): StackItem[] {
  const pref = normalizeBrandPref(
    sub?.preferences?.brand_pref ?? sub?.brand_pref ?? null
  );
  const isPremium = Boolean(sub?.is_premium) || Boolean(sub?.user?.is_premium) || (sub?.plan === "premium");
  return items.map((it) => {
    const linkAmazon = chooseAmazonLinkFor(it, pref);
    const linkFS = it.link_fullscript ?? null;
    if (isPremium && linkFS) {
      return { ...it, link_amazon: linkAmazon, link_fullscript: linkFS };
    }
    return { ...it, link_amazon: linkAmazon };
  });
}

// ---------------------------------------------------------------------------
// Main Export
// ---------------------------------------------------------------------------
export async function generateStackForSubmission(id: string) {
  // Pre-flight
  const sub = await getSubmissionWithChildren(id);
  if (!sub) {
    // Should not happen normally; produce skeleton so route still persists
    const md = ensureEnd(sanitizeMarkdown(skeletonMarkdown(null)));
    return {
      markdown: md,
      raw: null,
      model_used: "none",
      tokens_used: null,
      prompt_tokens: null,
      completion_tokens: null,
      validation: computeValidation(md),
    };
  }

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
  let raw: any = null;
  let modelUsed = "none";
  let tokensUsed: number | null = null;
  let promptTokens: number | null = null;
  let completionTokens: number | null = null;

  // -------------------------------------------------------------------------
  // LLM pass 1: mini
  // -------------------------------------------------------------------------
  if (process.env.OPENAI_API_KEY) {
    try {
      const resp = await callLLM(msgs, MODEL_MINI);
      raw = resp;
      modelUsed = resp.model ?? MODEL_MINI;
      tokensUsed = resp.usage?.total_tokens ?? null;
      promptTokens = resp.usage?.prompt_tokens ?? null;
      completionTokens = resp.usage?.completion_tokens ?? null;
      md = resp.choices?.[0]?.message?.content ?? "";
    } catch (err) {
      console.warn("Mini model failed:", err);
    }
  } else {
    console.warn("OPENAI_API_KEY missing — skipping model calls, using skeleton.");
  }

  let validations = computeValidation(md);
  console.log("validation.debug", validations);

  // -------------------------------------------------------------------------
  // LLM pass 2: full model (safe)
  // -------------------------------------------------------------------------
  if (!validations.ok) {
    try {
      if (process.env.OPENAI_API_KEY) {
        const resp = await callLLM(msgs, MODEL_FULL);
        raw = resp;
        modelUsed = resp.model ?? MODEL_FULL;
        tokensUsed = resp.usage?.total_tokens ?? null;
        promptTokens = resp.usage?.prompt_tokens ?? null;
        completionTokens = resp.usage?.completion_tokens ?? null;
        md = resp.choices?.[0]?.message?.content ?? "";
      }
    } catch (err) {
      console.warn("Fallback model failed:", err);
      // continue to skeleton
    }
    if (!md) md = skeletonMarkdown(sub);
    validations = computeValidation(md);
    console.log("validation.debug.fallback", validations);
  }

  // Always sanitize & ensure END
  md = ensureEnd(sanitizeMarkdown(md));

  // -------------------------------------------------------------------------
  // Parse → if empty, backfill from submission_supplements
  // -------------------------------------------------------------------------
  let parsedItems: StackItem[] = parseStackFromMarkdown(md);

  if (!parsedItems.length) {
    // backfill from submission_supplements children (if present)
    const ss = (sub as any)?.submission_supplements || (sub as any)?.supplements || [];
    if (Array.isArray(ss) && ss.length) {
      parsedItems = ss
        .map((r: any) => {
          const name = cleanName(r?.name || r?.supplement_name || "");
          if (!name) return null;
          return {
            name,
            dose: r?.dose ?? null,
            timing: normalizeTiming(r?.timing ?? null),
            rationale: r?.purpose ?? undefined,
          } as StackItem;
        })
        .filter(Boolean) as StackItem[];
    }
  }

  // If still nothing, seed with 3 safe defaults so enrichment path has anchors
  if (!parsedItems.length) {
    parsedItems = [
      { name: "Omega-3", dose: null, timing: "AM/PM" },
      { name: "Magnesium", dose: null, timing: "PM" },
      { name: "Vitamin D", dose: null, timing: "AM" },
    ];
  }

  // -------------------------------------------------------------------------
  // Safety checks
  // -------------------------------------------------------------------------
  const safetyInput = {
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
    is_premium:
      Boolean((sub as any)?.is_premium) ||
      Boolean((sub as any)?.user?.is_premium) ||
      ((sub as any)?.plan === "premium"),
  };

  const { cleaned, status: safetyStatus } = await applySafetyChecks(safetyInput, parsedItems);

  // Normalize names before enrichment; then enrich (fills link_* category + maybe link_fullscript)
  const normalizedForLinks = cleaned.map((it: any) => ({
    ...it,
    name: normalizeSupplementName(it.name),
  }));
  const enriched = await enrichAffiliateLinks(normalizedForLinks);

  // Pick actual destination links & attach evidence
  const withLinks = applyLinkPolicy(enriched, sub);
  const withEvidence = withLinks.map(attachEvidence);

  // Evidence override
  const { section: evidenceSection } = buildEvidenceSection(withEvidence, 8);
  md = overrideEvidenceInMarkdown(md, evidenceSection);

  // Shopping override (replace or append)
  const shoppingSection = buildShoppingLinksSection(withEvidence);
  const shoppingRe = /## Shopping Links([\s\S]*?)(?=\n## |\n## END|$)/i;
  if (shoppingRe.test(md)) {
    md = md.replace(shoppingRe, shoppingSection);
  } else {
    md = md.replace(/\n## END/i, `\n\n${shoppingSection}\n\n## END`);
  }

  const totalMonthlyCost = withEvidence.reduce((acc, it) => acc + (it.cost_estimate ?? 0), 0);

  // -------------------------------------------------------------------------
  // Persist parent stack
  // -------------------------------------------------------------------------
  let parentId: string | null = null;
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
          safety_status: safetyStatus,
          summary: md, // your /api route will also persist summary; keeping here is fine
          sections: {
            markdown: md,
            generated_at: new Date().toISOString(),
          },
          notes: null,
          total_monthly_cost: totalMonthlyCost,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "submission_id" }
      )
      .select("id")
      .single();

    if (error) console.error("Stacks upsert error:", error);
    parentId = (data as any)?.id ?? null;
  } catch (err) {
    console.error("Stacks upsert exception:", err);
  }

  // -------------------------------------------------------------------------
  // Persist stacks_items (ALWAYS attempt; do NOT require user_id)
  // -------------------------------------------------------------------------
  if (parentId) {
    try {
      await supabaseAdmin.from("stacks_items").delete().eq("stack_id", parentId);

      const rows: StackItemInsert[] = withEvidence.map((it) => {
        const normName = normalizeSupplementName(it?.name ?? "");
        const safeName = cleanName(normName) || "Item";
        return {
          stack_id: parentId!,
          user_id: user_id ?? null,
          user_email: userEmail ?? null,
          name: safeName,
          dose: it.dose ?? null,
          timing: it.timing ?? null,
          notes: it.notes ?? null,
          rationale: it.rationale ?? null,
          caution: it.caution ?? null,
          citations: it.citations ?? null, // jsonb array OK
          link_amazon: it.link_amazon ?? null,
          link_fullscript: it.link_fullscript ?? null,
          link_thorne: it.link_thorne ?? null,
          link_other: it.link_other ?? null,
          cost_estimate: it.cost_estimate ?? null,
        };
      });

      if (rows.length) {
        const { error } = await supabaseAdmin.from("stacks_items").insert(rows);
        if (error) console.error("stacks_items insert error:", error);
        else console.log(`✅ Inserted ${rows.length} stack items for stack ${parentId}`);
      } else {
        console.warn("No rows prepared for stacks_items");
      }
    } catch (err) {
      console.error("stacks_items persist exception:", err);
    }
  } else {
    console.warn("Missing parent stack id; skipping stacks_items insert");
  }

  // -------------------------------------------------------------------------
  // Return to route (never throw)
  // -------------------------------------------------------------------------
  return {
    markdown: md,
    raw,
    model_used: modelUsed,
    tokens_used: tokensUsed,
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    validation: validations,
  };
}

export default generateStackForSubmission;
