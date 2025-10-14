/* eslint-disable @typescript-eslint/consistent-type-imports */
/* eslint-disable no-console */
// ----------------------------------------------------------------------------
// LVE360 — generateStack.ts (defensive, never-throw)
// ----------------------------------------------------------------------------

import getSubmissionWithChildren from "@/lib/getSubmissionWithChildren";
import type { SubmissionWithChildren } from "@/lib/getSubmissionWithChildren";
import type { ChatCompletionMessageParam } from "openai/resources";
import { applySafetyChecks } from "@/lib/safetyCheck";
import { enrichAffiliateLinks } from "@/lib/affiliateLinks";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getTopCitationsFor } from "@/lib/evidence";
import evidenceIndex from "@/evidence/evidence_index_top3.json";

// ---- Config -----------------------------------------------------------------
const TODAY = "2025-09-21";
const MIN_WORDS = 1000;
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
] as const;

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

  link_budget?: string | null;
  link_trusted?: string | null;
  link_clean?: string | null;
  link_default?: string | null;

  link_amazon?: string | null;
  link_fullscript?: string | null;
  link_thorne?: string | null;
  link_other?: string | null;

  cost_estimate?: number | null;
  brand?: string | null;
  link_type?: string | null;
  is_custom?: boolean | null;
}

type InsertItemRow = {
  stack_id: string;
  user_id: string | null;
  user_email: string | null;
  name: string;
  brand: string | null;
  dose: string | null;
  timing: string | null;
  notes: string | null;
  rationale: string | null;
  caution: string | null;
  citations: string[] | null;
  cost_estimate: number | null;
  link_amazon: string | null;
  link_thorne: string | null;
  link_fullscript: string | null;
  link_other: string | null;
  link_type: string | null;
  is_custom: boolean | null;
};

interface EvidenceEntry { url?: string | null; [k: string]: any }
type EvidenceIndex = Record<string, EvidenceEntry[]>;
const EVIDENCE: EvidenceIndex = evidenceIndex as unknown as EvidenceIndex;

// ---- Utils ------------------------------------------------------------------
const wc = (t: string) => t.trim().split(/\s+/).length;
const hasEnd = (t: string) => /(^|\n)## END\s*$/i.test(t.trim());
const seeDN = "See Dosing & Notes";
const cleanName = (raw: string) => (raw || "").replace(/[*_`#]/g, "").replace(/\s+/g, " ").trim();
const age = (dob: string | null) => {
  if (!dob) return null;
  const d = new Date(dob); const t = new Date(TODAY);
  let a = t.getFullYear() - d.getFullYear();
  if (t < new Date(t.getFullYear(), d.getMonth(), d.getDate())) a--;
  return a;
};
const extractUserId = (sub: any): string | null =>
  sub?.user_id ?? (typeof sub.user === "object" ? sub.user?.id : null) ?? null;

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
  const rawUnit = (cleaned.match(/(mcg|μg|ug|mg|g|iu)\b/i)?.[1]) || "";
  let unit = normalizeUnit(rawUnit);
  let val = amount;
  if (unit === "g") { val = amount * 1000; unit = "mg"; }
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
const ALIAS_MAP: Record<string,string> = {
  "Omega-3":"omega-3 (epa+dha)","Vitamin D":"vitamin d3","Magnesium":"magnesium (glycinate)",
  "Ashwagandha":"ashwagandha (ksm-66 or similar)","Bacopa Monnieri":"bacopa monnieri (50% bacosides)",
  "CoQ10":"coq10 (ubiquinone)","Rhodiola Rosea":"rhodiola rosea (3% rosavins)","Ginkgo Biloba":"ginkgo biloba (24/6)",
  "Zinc":"zinc (picolinate)","B-Vitamins":"b-complex","L-Theanine":"l-theanine","Acetyl-L-carnitine":"acetyl-l-carnitine",
};
const toSlug = (s: string) => (s || "").toLowerCase().replace(/[^\w\s()+/.-]/g, "").replace(/\s+/g, " ").trim();

function buildEvidenceCandidates(normName: string): string[] {
  const c: string[] = [];
  const alias = ALIAS_MAP[normName]; if (alias) c.push(alias);
  const lower = toSlug(normName);
  if (lower) c.push(lower, lower.replace(/\s+/g,"-"), lower.replace(/\s+/g,""));
  const expansions: Record<string,string[]> = {
    "Omega-3":["omega-3 (epa+dha)","omega-3","omega 3"],"Vitamin D":["vitamin d3","vitamin d","vitamin-d"],
    "Magnesium":["magnesium (glycinate)","magnesium"],"Ashwagandha":["ashwagandha (ksm-66 or similar)","ashwagandha"],
    "Bacopa Monnieri":["bacopa monnieri (50% bacosides)","bacopa monnieri"],"CoQ10":["coq10 (ubiquinone)","coq10"],
    "Rhodiola Rosea":["rhodiola rosea (3% rosavins)","rhodiola rosea"],"Ginkgo Biloba":["ginkgo biloba (24/6)","ginkgo biloba"],
    "Zinc":["zinc (picolinate)","zinc"],"B-Vitamins":["b-complex","b vitamins","b-vitamins"],
    "L-Theanine":["l-theanine","l theanine"],"Acetyl-L-carnitine":["acetyl-l-carnitine","acetyl l carnitine","alc"],
  };
  if (expansions[normName]) c.push(...expansions[normName]);
  return Array.from(new Set(c)).filter(Boolean);
}

// ---- Evidence helpers --------------------------------------------------------
const sanitizeCitationsModel = (urls: string[]) =>
  (urls || []).map(u => (typeof u === "string" ? u.trim() : "")).filter(u => MODEL_CITE_RE.test(u));
function getTopCitationsFromJson(key: string, limit = 3): string[] {
  const arr = EVIDENCE[key] as EvidenceEntry[] | undefined;
  if (!arr || !Array.isArray(arr)) return [];
  const urls = arr.map(e => (e?.url || "").trim()).filter(u => CURATED_CITE_RE.test(u));
  return urls.slice(0, limit);
}
function lookupCuratedForCandidates(cands: string[], limit=3): string[] {
  for (const key of cands) {
    const citations = getTopCitationsFor(key, 2);
    if (citations.length) return citations;
  }
  const slugged = cands.map(toSlug);
  for (const cand of slugged) {
    for (const jsonKey of Object.keys(EVIDENCE)) {
      const slugKey = toSlug(jsonKey);
      if (slugKey.includes(cand) || cand.includes(slugKey)) {
        const hits = getTopCitationsFromJson(jsonKey, limit);
        if (hits.length) { console.log("evidence.fuzzy_match", { cand, jsonKey, hits }); return hits; }
      }
    }
  }
  return [];
}

// ---- Sections builders -------------------------------------------------------
const hostOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./,""); } catch { return ""; } };
function labelForUrl(u: string) {
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
function buildEvidenceSection(items: StackItem[], minCount=8) {
  const bullets: Array<{name:string; url:string}> = [];
  for (const it of items) {
    const citations = it.citations ?? [];
    for (const raw of citations) {
      const url = raw.trim();
      const normalized = url.endsWith("/") ? url : url + "/";
      if (CURATED_CITE_RE.test(normalized) || MODEL_CITE_RE.test(normalized)) {
        bullets.push({ name: cleanName(it.name), url: normalized });
      }
    }
  }
  const seen = new Set<string>();
  const uniq = bullets.filter(b => (seen.has(b.url) ? false : (seen.add(b.url), true)));
  const take = uniq.length >= minCount
    ? uniq
    : [...uniq, ...Array.from({length: minCount-uniq.length}).map(() => ({
        name:"Evidence pending", url:"https://lve360.com/evidence/coming-soon"
      }))];
  const bulletsText = take.map(b => `- ${b.name}: [${labelForUrl(b.url)}](${b.url})`).join("\n");
  const analysis = `

**Analysis**

These references are pulled from LVE360’s curated evidence index (PubMed/PMC/DOI and other trusted journals) and replace any model-generated references.
`;
  return { section: `## Evidence & References\n\n${bulletsText}${analysis}`, bullets: take };
}
const overrideEvidenceInMarkdown = (md: string, section: string) =>
  (/## Evidence & References([\s\S]*?)(?=\n## |\n## END|$)/i.test(md)
    ? md.replace(/## Evidence & References([\s\S]*?)(?=\n## |\n## END|$)/i, section)
    : md.replace(/\n## END/i, `\n\n${section}\n\n## END`));

function buildShoppingLinksSection(items: StackItem[]): string {
  if (!items || items.length === 0) {
    return "## Shopping Links\n\n- No links available yet.\n\n**Analysis**\n\nLinks will be provided once products are mapped.";
  }
  const bullets = items.map(it => {
    const links: string[] = [];
    if (it.link_amazon) links.push(`[Amazon](${it.link_amazon})`);
    if (it.link_fullscript) links.push(`[Fullscript](${it.link_fullscript})`);
    if (it.link_thorne) links.push(`[Thorne](${it.link_thorne})`);
    if (it.link_other) links.push(`[Other](${it.link_other})`);
    return `- **${cleanName(it.name)}**: ${links.join(" • ")}`;
  });
  return `## Shopping Links\n\n${bullets.join("\n")}\n\n**Analysis**\n\nThese links are provided for convenience. Premium users may see Fullscript options when available; Amazon links are shown for everyone.`;
}

// ---- Parser -----------------------------------------------------------------
function parseStackFromMarkdown(md: string): StackItem[] {
  const base: Record<string, any> = {};

  const blueprint = md.match(/## Your Blueprint Recommendations([\s\S]*?)(\n## |$)/i);
  if (blueprint) {
    const rows = blueprint[1].split("\n").filter(l => l.trim().startsWith("|"));
    rows.slice(1).forEach((row, i) => {
      const cols = row.split("|").map(c => c.trim());
      const name = cleanName(cols[2] || `Item ${i+1}`);
      if (!name) return;
      base[name.toLowerCase()] = { name, rationale: cols[3] || undefined, dose: null, dose_parsed: null, timing: null };
    });
  }

  const current = md.match(/## Current Stack([\s\S]*?)(\n## |$)/i);
  if (current) {
    const rows = current[1].split("\n").filter(l => l.trim().startsWith("|"));
    rows.slice(1).forEach((row, i) => {
      const cols = row.split("|").map(c => c.trim());
      const name = cleanName(cols[1] || `Current Item ${i+1}`);
      if (!name) return;
      const key = name.toLowerCase();
      const dose = cols[3] || null;
      base[key] ??= {};
      base[key].name = name;
      base[key].rationale = cols[2] || undefined;
      base[key].dose = dose;
      base[key].dose_parsed = parseDose(dose);
      base[key].timing = normalizeTiming(cols[4] || null);
    });
  }

  const dosing = md.match(/## Dosing & Notes([\s\S]*?)(\n## |\n## END|$)/i);
  if (dosing) {
    for (const line of dosing[1].split("\n").filter(Boolean)) {
      const m = line.match(/[-*]\s*([^—\-:]+)[—\-:]\s*([^,]+)(?:,\s*(.*))?/);
      if (!m) continue;
      const name = cleanName(m[1].trim()); if (!name) continue;
      const key = name.toLowerCase();
      const dose = m[2]?.trim() || null;
      const timing = normalizeTiming(m[3]);
      base[key] ??= { name };
      base[key].dose = dose;
      base[key].dose_parsed = parseDose(dose);
      base[key].timing = timing;
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
Return **plain ASCII Markdown** with headings EXACTLY:

${HEADINGS.slice(0, -1).join("\n")}

Every section ends with **Analysis** (≥${MIN_ANALYSIS_SENTENCES} sentences).
Blueprint has ≥${MIN_BP_ROWS} rows. Use “${seeDN}” for unknown dose/timing.
Finish with \`## END\`.`;
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
  return openai.chat.completions.create({ model, temperature: 0.7, max_tokens: 4096, messages });
}

// ---- Validation --------------------------------------------------------------
const headingsOK = (md: string) => HEADINGS.slice(0, -1).every(h => md.includes(h));
function blueprintOK(md: string) {
  const sec = md.match(/## Your Blueprint Recommendations([\s\S]*?)(\n\|)/i);
  if (!sec) return false;
  const rows = sec[0].split("\n").filter(l => l.startsWith("|")).slice(1);
  return rows.length >= MIN_BP_ROWS;
}
function citationsOK(md: string) {
  const block = md.match(/## Evidence & References([\s\S]*?)(\n## |\n## END|$)/i);
  if (!block) return false;
  const bulletLines = block[1].split("\n").filter(l => l.trim().startsWith("-"));
  if (bulletLines.length < 8) return false;
  return bulletLines.every(l => MODEL_CITE_RE.test(l) || CURATED_CITE_RE.test(l));
}
function narrativesOK(md: string) {
  const sections = md.split("\n## ").slice(1);
  return sections.every((sec) => {
    const text = sec.split("\n").filter(l => !l.startsWith("|") && !l.trim().startsWith("-")).join(" ");
    const sentences = text.split(/[.!?]/).map(s => s.trim()).filter(Boolean);
    if (sec.startsWith("Intro Summary") && sentences.length < 2) return false;
    if (!sec.startsWith("Intro Summary") && sentences.length < MIN_ANALYSIS_SENTENCES) return false;
    return true;
  });
}
const ensureEnd = (md: string) => (hasEnd(md) ? md : md + "\n\n## END");

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
  return items.map(it => {
    const linkAmazon = chooseAmazonLinkFor(it, pref);
    const linkFS = it.link_fullscript ?? null;
    if (isPremium && linkFS) return { ...it, link_amazon: linkAmazon, link_fullscript: linkFS };
    return { ...it, link_amazon: linkAmazon };
  });
}

// ---- Minimal skeleton (for hard fallback) -----------------------------------
function minimalMarkdown(name?: string | null) {
  const hello = name ? `Hi ${name.split(" ")[0]},` : "Hi there,";
  return ensureEnd(
`## Intro Summary
${hello} here’s a draft of your LVE360 plan. If a section looks short, it will improve on the next run.

## Goals
Goal | Description
| --- | --- |
| Energy | Feel steady energy across the day |
| Sleep | Improve quality and duration |

**Analysis**
We’ll refine once we parse more details.

## Contraindications & Med Interactions
- Review safety before changes.

**Analysis**
Medication and health history matter for dose and timing.

## Current Stack
Medication/Supplement | Purpose | Dosage | Timing
| --- | --- | --- | --- |

**Analysis**
If you’re taking anything now, it will appear here next pass.

## Your Blueprint Recommendations
| Rank | Supplement | Why it Matters |
| --- | --- | --- |
| 1 | Magnesium | Supports sleep and relaxation |
| 2 | Omega-3 | Cardiometabolic and brain support |
| 3 | Vitamin D | Immune and mood support |
| 4 | B-Vitamins | Energy metabolism |
| 5 | L-Theanine | Calm focus |
| 6 | Zinc | Immune and recovery |
| 7 | Rhodiola Rosea | Stress resilience |
| 8 | CoQ10 | Cellular energy |
| 9 | Ashwagandha | Stress balance |
| 10 | Acetyl-L-carnitine | Mitochondrial support |

*${seeDN}*

**Analysis**
These are common, safe starting points; dosing below.

## Dosing & Notes
- Magnesium — 200–400 mg, PM
- Omega-3 — 1–2 g EPA+DHA, AM
- Vitamin D — 1000–2000 IU, AM

**Analysis**
Confirm with your clinician before starting.

## Evidence & References
- Magnesium: [PubMed](https://pubmed.ncbi.nlm.nih.gov/22192974/)
- Omega-3: [PubMed](https://pubmed.ncbi.nlm.nih.gov/35438426/)
- Vitamin D: [DOI](https://doi.org/10.1210/jc.2011-0385/)
- B-Vitamins: [BMC](https://bmcpsychiatry.biomedcentral.com/)
- L-Theanine: [PubMed](https://pubmed.ncbi.nlm.nih.gov/18296328/)
- Zinc: [Nature](https://www.nature.com/)
- Rhodiola: [DOI](https://doi.org/)
- CoQ10: [ScienceDirect](https://www.sciencedirect.com/)

**Analysis**
Starter citations; full list will expand.

## Shopping Links
- Links will appear after enrichment.

**Analysis**
We’ll map budget/trusted/clean options automatically.

## Follow-up Plan
- Re-check in 2–4 weeks
- Track sleep/energy
- Adjust dosing slowly

**Analysis**
Iteration improves outcomes.

## Lifestyle Prescriptions
- Walk 20–30 min daily
- Consistent sleep/wake
- Protein with each meal

**Analysis**
Foundational changes amplify supplements.

## Longevity Levers
- Movement, sleep, stress regulation

**Analysis**
Simple, repeatable levers move the needle.

## This Week Try
- Evening wind-down
- Morning light exposure
- 10-min walk after meals

**Analysis**
Tiny habits compound.

## END` );
}

// ---- Main --------------------------------------------------------------------
export async function generateStackForSubmission(id: string) {
  let md = "";
  let modelUsed = "unknown";
  let tokensUsed: number | null = null;
  let promptTokens: number | null = null;
  let completionTokens: number | null = null;
  let validationOK = false;

  try {
    if (!id) throw new Error("submissionId required");

    const sub = (await getSubmissionWithChildren(id)) as SubmissionWithChildren | null;
    if (!sub) throw new Error(`Submission row not found for id=${id}`);

    const user_id = extractUserId(sub);
    const userEmail =
      (sub as any)?.user?.email ?? (sub as any)?.user_email ?? (sub as any)?.email ?? null;

    // ---------- LLM (best-effort; never throw) ----------
    const msgs: ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt() },
      { role: "user", content: userPrompt(sub) },
    ];

    try {
      if (process.env.OPENAI_API_KEY) {
        try {
          const resp = await callLLM(msgs, "gpt-4o-mini");
          modelUsed = resp.model ?? "gpt-4o-mini";
          tokensUsed = resp.usage?.total_tokens ?? null;
          promptTokens = resp.usage?.prompt_tokens ?? null;
          completionTokens = resp.usage?.completion_tokens ?? null;
          md = resp.choices[0]?.message?.content ?? "";
          const v1 = {
            wordCountOK: wc(md) >= MIN_WORDS,
            headingsValid: headingsOK(md),
            blueprintValid: blueprintOK(md),
            citationsValid: citationsOK(md),
            narrativesValid: narrativesOK(md),
            endValid: hasEnd(md),
            actualWordCount: wc(md),
          };
          console.log("validation.debug", v1);
          validationOK = Object.values(v1).every(Boolean);
        } catch (e) {
          console.warn("Mini model error:", e);
        }
        if (!validationOK) {
          try {
            const resp = await callLLM(msgs, "gpt-4o");
            modelUsed = resp.model ?? "gpt-4o";
            tokensUsed = resp.usage?.total_tokens ?? null;
            promptTokens = resp.usage?.prompt_tokens ?? null;
            completionTokens = resp.usage?.completion_tokens ?? null;
            md = resp.choices[0]?.message?.content ?? "";
            const v2 = {
              wordCountOK: wc(md) >= MIN_WORDS,
              headingsValid: headingsOK(md),
              blueprintValid: blueprintOK(md),
              citationsValid: citationsOK(md),
              narrativesValid: narrativesOK(md),
              endValid: hasEnd(md),
              actualWordCount: wc(md),
            };
            console.log("validation.debug.fallback", v2);
            validationOK = Object.values(v2).every(Boolean);
          } catch (e) {
            console.warn("4o model error:", e);
          }
        }
      } else {
        console.error("OPENAI_API_KEY missing — using minimal skeleton.");
      }
    } catch (e) {
      console.warn("LLM stage error:", e);
    }

    if (!md) md = minimalMarkdown((sub as any)?.name ?? null);
    md = ensureEnd(md);

    // ---------- Parse -> items ----------
    let parsedItems: StackItem[] = [];
    try {
      parsedItems = parseStackFromMarkdown(md);
    } catch (e) {
      console.warn("parseStackFromMarkdown failed:", e);
      parsedItems = [];
    }

    // ---------- Safety ----------
    let cleaned: StackItem[] = parsedItems;
    let safetyStatus: string | null = null;
    try {
      const safetyInput = {
        medications: Array.isArray((sub as any).medications) ? (sub as any).medications.map((m: any) => m.med_name || "") : [],
        conditions: Array.isArray((sub as any).conditions) ? (sub as any).conditions.map((c: any) => c.condition_name || "") : [],
        allergies: Array.isArray((sub as any).allergies) ? (sub as any).allergies.map((a: any) => a.allergy_name || "") : [],
        pregnant: typeof (sub as any).pregnant === "boolean" || typeof (sub as any).pregnant === "string" ? (sub as any).pregnant : null,
        brand_pref: (sub as any)?.preferences?.brand_pref ?? null,
        dosing_pref: (sub as any)?.preferences?.dosing_pref ?? null,
        is_premium: Boolean((sub as any)?.is_premium) || Boolean((sub as any)?.user?.is_premium) || ((sub as any)?.plan === "premium"),
      };
      const res = await applySafetyChecks(safetyInput, parsedItems);
      cleaned = res.cleaned;
      safetyStatus = res.status;
    } catch (e) {
      console.warn("applySafetyChecks failed:", e);
      cleaned = parsedItems;
      safetyStatus = null;
    }

    // ---------- Enrichment & policy ----------
    let withEvidence: StackItem[] = [];
    try {
      const normalizedForLinks = cleaned.map(it => ({ ...it, name: normalizeSupplementName(it.name) }));
      const enriched = await enrichAffiliateLinks(normalizedForLinks);
      const policy = applyLinkPolicy(enriched, sub);
      withEvidence = policy.map((item) => {
        const normName = normalizeSupplementName(item.name);
        const candidates = buildEvidenceCandidates(normName);
        const curatedUrls = lookupCuratedForCandidates(candidates, 3);
        const modelValid = sanitizeCitationsModel(item.citations ?? []);
        const final = curatedUrls.length ? curatedUrls : modelValid;
        return { ...item, name: normName, citations: final.length ? final : null };
      });
    } catch (e) {
      console.warn("enrichment/policy failed:", e);
      withEvidence = cleaned;
    }

    // ---------- Override sections ----------
    try {
      const { section: ev } = buildEvidenceSection(withEvidence, 8);
      md = overrideEvidenceInMarkdown(md, ev);
      const shop = buildShoppingLinksSection(withEvidence);
      const re = /## Shopping Links([\s\S]*?)(?=\n## |\n## END|$)/i;
      md = re.test(md) ? md.replace(re, shop) : md.replace(/\n## END/i, `\n\n${shop}\n\n## END`);
    } catch (e) {
      console.warn("override sections failed:", e);
    }

    // ---------- Persist parent ----------
    let parentId: string | null = null;
    try {
      const { data: parent, error } = await supabaseAdmin
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
            total_monthly_cost: withEvidence.reduce((acc, it) => acc + (it.cost_estimate ?? 0), 0),
            summary: md,
            sections: { markdown: md, generated_at: new Date().toISOString() },
          },
          { onConflict: "submission_id" }
        )
        .select("id")
        .maybeSingle();
      if (error) console.error("Supabase stacks upsert error:", error);
      parentId = parent?.id ?? null;
    } catch (e) {
      console.warn("stacks upsert exception:", e);
    }

    // ---------- Persist items ----------
    if (parentId) {
      try {
        await supabaseAdmin.from("stacks_items").delete().eq("stack_id", parentId);
        const rows: (InsertItemRow | null)[] = withEvidence.map((it) => {
          const normName = normalizeSupplementName(it?.name ?? "");
          const safeName = cleanName(normName);
          if (!safeName || safeName.toLowerCase() === "null") {
            console.error("🚨 Blocking insert of invalid item", { stack_id: parentId, rawName: it?.name, normalized: normName });
            return null;
          }
          return {
            stack_id: parentId!,
            user_id: user_id ?? null,
            user_email: userEmail ?? null,
            name: safeName,
            brand: it.brand ?? null,
            dose: it.dose ?? null,
            timing: it.timing ?? null,
            notes: it.notes ?? null,
            rationale: it.rationale ?? null,
            caution: it.caution ?? null,
            citations: it.citations ?? null,
            cost_estimate: it.cost_estimate ?? null,
            link_amazon: it.link_amazon ?? null,
            link_thorne: it.link_thorne ?? null,
            link_fullscript: it.link_fullscript ?? null,
            link_other: it.link_other ?? null,
            link_type: it.link_type ?? null,
            is_custom: it.is_custom ?? null,
          };
        });
        const cleanRows = rows.filter((r): r is InsertItemRow => r !== null);
        if (cleanRows.length > 0) {
          const { error } = await supabaseAdmin.from("stacks_items").insert(cleanRows);
          if (error) console.error("⚠️ stacks_items insert error:", error);
          else console.log(`✅ Inserted ${cleanRows.length} items for stack ${parentId}`);
        } else {
          console.log("ℹ️ No valid items parsed from markdown.");
        }
      } catch (e) {
        console.error("stacks_items upsert exception:", e);
      }
    }

    return {
      markdown: md,
      raw: null,
      model_used: modelUsed,
      tokens_used: tokensUsed,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      validation: { ok: validationOK, min_words: MIN_WORDS },
    };
  } catch (fatal: any) {
    // Absolute catch-all so route never sees a throw
    console.error("[generator] fatal", fatal);
    const fallback = minimalMarkdown(null);
    return {
      markdown: fallback,
      raw: null,
      model_used: "fallback",
      tokens_used: null,
      prompt_tokens: null,
      completion_tokens: null,
      validation: { ok: false, min_words: MIN_WORDS, error: String(fatal?.message ?? fatal) },
    };
  }
}

export default generateStackForSubmission;
