/* eslint-disable @typescript-eslint/consistent-type-imports */
/* eslint-disable no-console */
// ----------------------------------------------------------------------------
// LVE360 — generateStack.ts (REWRITTEN)
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
export interface StackItem {
  name: string;
  dose?: string | null;
  dose_parsed?: { amount?: number; unit?: string };
  timing?: string | null;
  rationale?: string | null;
  notes?: string | null;
  caution?: string | null;
  citations?: string[] | null;

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

interface EvidenceEntry {
  url?: string | null;
  [key: string]: any;
}

type EvidenceIndex = Record<string, EvidenceEntry[]>;
const EVIDENCE: EvidenceIndex = (evidenceIndex as unknown) as EvidenceIndex;

// ----------------------------------------------------------------------------
// Utilities
// ----------------------------------------------------------------------------
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

function extractUserId(sub: any): string | null {
  return (
    sub?.user_id ??
    (typeof sub.user === "object" ? sub.user?.id : null) ??
    null
  );
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
  if (collapsed.includes("b complex") || collapsed.includes("b-vitamins")) return "B-Vitamins";

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
// LLM wrapper
// ----------------------------------------------------------------------------
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

// ----------------------------------------------------------------------------
// Validation helpers
// ----------------------------------------------------------------------------
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
    if (!sec.startsWith("Intro Summary") && sentences.length < MIN_ANALYSIS_SENTENCES)
      return false;
    return true;
  });
}

function ensureEnd(md: string) {
  return hasEnd(md) ? md : md + "\n\n## END";
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
    null
  );
}

function applyLinkPolicy(items: StackItem[], sub: any): StackItem[] {
  const pref = normalizeBrandPref(
    sub?.preferences?.brand_pref ??
    sub?.brand_pref ??
    null
  );

  const isPremium =
    Boolean(sub?.is_premium) ||
    Boolean(sub?.user?.is_premium) ||
    (sub?.plan === "premium");

  return items.map((it) => {
    const linkAmazon = chooseAmazonLinkFor(it, pref);
    let linkFS = it.link_fullscript ?? null;

    // Premium policy: prefer Fullscript if available, but still keep Amazon set
    // (UI can prefer link_fullscript when present and user is premium)
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
export async function generateStackForSubmission(id: string) {
  if (!id) throw new Error("submissionId required");
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY missing");

  const sub = await getSubmissionWithChildren(id);
  if (!sub) throw new Error(`Submission row not found for id=${id}`);

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
  let modelUsed = "unknown";
  let tokensUsed: number | null = null;
  let promptTokens: number | null = null;
  let completionTokens: number | null = null;
  let passes = false;

  try {
    const resp = await callLLM(msgs, "gpt-4o-mini");
    raw = resp;
    modelUsed = resp.model ?? "gpt-4o-mini";
    tokensUsed = resp.usage?.total_tokens ?? null;
    promptTokens = resp.usage?.prompt_tokens ?? null;
    completionTokens = resp.usage?.completion_tokens ?? null;
    md = resp.choices[0]?.message?.content ?? "";

    // Validation
    const wordCountOK = wc(md) >= MIN_WORDS;
    const headingsValid = headingsOK(md);
    const blueprintValid = blueprintOK(md);
    const citationsValid = citationsOK(md);
    const narrativesValid = narrativesOK(md);
    const endValid = hasEnd(md);

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
  } catch (err) {
    console.warn("Mini model failed:", err);
  }

  if (!passes) {
    const resp = await callLLM(msgs, "gpt-4o");
    raw = resp;
    modelUsed = resp.model ?? "gpt-4o";
    tokensUsed = resp.usage?.total_tokens ?? null;
    promptTokens = resp.usage?.prompt_tokens ?? null;
    completionTokens = resp.usage?.completion_tokens ?? null;
    md = resp.choices[0]?.message?.content ?? "";

    const wordCountOK = wc(md) >= MIN_WORDS;
    const headingsValid = headingsOK(md);
    const blueprintValid = blueprintOK(md);
    const citationsValid = citationsOK(md);
    const narrativesValid = narrativesOK(md);
    const endValid = hasEnd(md);

    console.log("validation.debug.fallback", {
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

  const parsedItems: StackItem[] = parseStackFromMarkdown(md);

  // Safety checks
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

  const { cleaned, status: safetyResult } = await applySafetyChecks(
    safetyInput,
    parsedItems
  );

  // Enrich with links (expects to fill link_budget/trusted/clean/default and possibly link_fullscript)
  const enriched = await enrichAffiliateLinks(cleaned);

  // Apply link policy: pick Amazon category from quiz, prefer Fullscript for premium
  const finalStack: StackItem[] = applyLinkPolicy(enriched, sub);

  // Evidence attach
  const withEvidence: StackItem[] = finalStack.map(attachEvidence);

  // Override evidence section in markdown
  const { section: evidenceSection } = buildEvidenceSection(withEvidence, 8);
  md = overrideEvidenceInMarkdown(md, evidenceSection);

  const totalMonthlyCost = withEvidence.reduce(
    (acc, it) => acc + (it.cost_estimate ?? 0),
    0
  );

  // Persist parent stack
  let parentRows: any[] = [];
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
          safety_status: safetyResult,
          summary: md,
          sections: {
            markdown: md,
            generated_at: new Date().toISOString(),
          },
          notes: null,
          total_monthly_cost: totalMonthlyCost,
        },
        { onConflict: "submission_id" }
      )
      .select();
    if (error) console.error("Supabase upsert error:", error);
    if (data && data.length > 0) parentRows = data;
  } catch (err) {
    console.error("Stacks upsert exception:", err);
  }

  // Persist items
  if (parentRows.length > 0) {
    const parent = parentRows[0];
    if (parent?.id && user_id) {
      await supabaseAdmin.from("stacks_items").delete().eq("stack_id", parent.id);

      const rows = withEvidence
        .map((it) => {
          const normName = normalizeSupplementName(it?.name ?? "");
          const safeName = cleanName(normName);
          if (!safeName || safeName.toLowerCase() === "null") {
            console.error("🚨 Blocking insert of invalid item", {
              stack_id: parent.id,
              user_id,
              rawName: it?.name,
              normalized: normName,
              item: it,
            });
            return null;
          }
          return {
            stack_id: parent.id,
            user_id,
            user_email: userEmail,
            name: safeName, // normalized
            dose: it.dose ?? null,
            timing: it.timing ?? null,
            notes: it.notes ?? null,
            rationale: it.rationale ?? null,
            caution: it.caution ?? null,
            citations: it.citations ? JSON.stringify(it.citations) : null,

            // Persist links (Amazon chosen by preference, FS preferred for premium but optional)
            link_amazon: it.link_amazon ?? null,
            link_fullscript: it.link_fullscript ?? null,
            link_thorne: it.link_thorne ?? null,
            link_other: it.link_other ?? null,

            cost_estimate: it.cost_estimate ?? null,
          };
        })
        .filter((r) => r !== null);

      console.log("✅ Prepared stack_items rows:", rows);

      if ((rows as any[]).length > 0) {
        const { error } = await supabaseAdmin.from("stacks_items").insert(rows as any[]);
        if (error) console.error("⚠️ Failed to insert stacks_items:", error);
        else console.log(`✅ Inserted ${(rows as any[]).length} stack items for stack ${parent.id}`);
      }
    }
  }

  if (!passes) {
    console.warn("⚠️ Draft validation failed, review needed.");
  }

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
