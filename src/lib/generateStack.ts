/* eslint-disable @typescript-eslint/consistent-type-imports */
import getSubmissionWithChildren from "@/lib/getSubmissionWithChildren";
import type { SubmissionWithChildren } from "@/lib/getSubmissionWithChildren";
import { ChatCompletionMessageParam } from "openai/resources";
import { applySafetyChecks } from "@/lib/safetyCheck";
import { enrichAffiliateLinks } from "@/lib/affiliateLinks";
import { supabaseAdmin } from "@/lib/supabase";
import { getTopCitationsFor, sanitizeCitations } from "@/lib/evidence";

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────
const TODAY = "2025-09-21";
const MIN_WORDS = 1800;
const MIN_BP_ROWS = 10;
const MIN_ANALYSIS_SENTENCES = 3;
const CITE_RE = /(https?:\/\/(?:pubmed\.|doi\.org)[^\s)]+)/i;

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

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
/** Final item shape we persist to stacks_items (and pass through safety/affiliates) */
export interface StackItem {
  name: string;
  dose?: string | null;
  dose_parsed?: { amount?: number; unit?: string };
  timing?: string | null;
  rationale?: string | null;
  notes?: string | null;
  caution?: string | null;
  citations?: string[] | null;
  link_amazon?: string | null;
  link_fullscript?: string | null;
  link_thorne?: string | null;
  link_other?: string | null;
  cost_estimate?: number | null;
}

interface EvidenceEntry {
  url?: string | null;
  [key: string]: any;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
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
  if (/am|morning/.test(s)) return "AM";
  if (/pm|evening|night/.test(s)) return "PM";
  if (/am\/pm|both|split|bid/.test(s)) return "AM/PM";
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

// Curated/validated evidence attach
function attachEvidence(item: { name: string; citations?: string[] }): {
  name: string;
  dose?: string | null;
  dose_parsed?: { amount?: number; unit?: string };
  timing?: string | null;
  rationale?: string | null;
  notes?: string | null;
  caution?: string | null;
  citations?: string[] | null;
  link_amazon?: string | null;
  link_fullscript?: string | null;
  link_thorne?: string | null;
  link_other?: string | null;
  cost_estimate?: number | null;
} {
  const curated = getTopCitationsFor(item.name, 2)
    .map((e: EvidenceEntry) => e?.url || "")
    .filter((u: string): u is string => Boolean(u));

  const modelValid = sanitizeCitations(item.citations ?? []);
  const final = curated.length ? curated : modelValid;

  return { ...item, citations: final.slice(0, 2) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Parser from Markdown → StackItem[]
// ─────────────────────────────────────────────────────────────────────────────
function parseStackFromMarkdown(md: string): StackItem[] {
  const base: Record<string, any> = {};

  // --- 1) Blueprint Recommendations
  const blueprint = md.match(
    /## Your Blueprint Recommendations([\s\S]*?)(\n## |$)/i
  );
  if (blueprint) {
    const rows = blueprint[1]
      .split("\n")
      .filter((l) => l.trim().startsWith("|"));
    // Skip header row
    rows.slice(1).forEach((row, i) => {
      const cols = row.split("|").map((c) => c.trim());
      // Expecting: | Rank | Supplement | Why it Matters |
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

  // --- 2) Current Stack
  const current = md.match(/## Current Stack([\s\S]*?)(\n## |$)/i);
  if (current) {
    const rows = current[1]
      .split("\n")
      .filter((l) => l.trim().startsWith("|"));
    // Skip header row
    rows.slice(1).forEach((row, i) => {
      const cols = row.split("|").map((c) => c.trim());
      // Expecting: | Medication/Supplement | Purpose | Dosage | Timing |
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

  // --- 3) Dosing & Notes (bulleted list)
  const dosing = md.match(/## Dosing & Notes([\s\S]*?)(\n## |\n## END|$)/i);
  if (dosing) {
    const lines = dosing[1].split("\n").filter((l) => l.trim().length > 0);
    for (const line of lines) {
      // "- NAME — DOSE, TIMING" or "- NAME - DOSE, TIMING" or "- NAME: DOSE, TIMING"
      const m = line.match(
        /[-*]\s*([^—\-:]+)[—\-:]\s*([^,]+)(?:,\s*(.*))?/
      );
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

  // --- Return valid, deduped items
  const seen = new Set<string>();
  return Object.values(base).filter((it: any) => {
    if (!it?.name) return false;
    const key = it.name.trim().toLowerCase();
    if (!key) return false;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Prompts
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// LLM
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────
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
  const block = md.match(
    /## Evidence & References([\s\S]*?)(\n## |\n## END|$)/i
  );
  if (!block) return false;
  const bulletLines = block[1].split("\n").filter((l) => l.trim().startsWith("-"));
  if (bulletLines.length < 8) return false;
  return bulletLines.every((l) => CITE_RE.test(l));
}

function narrativesOK(md: string) {
  // For each section, ensure there's narrative text with ≥ sentence count
  const sections = md.split("\n## ").slice(1); // drop the first empty chunk
  return sections.every((sec) => {
    const lines = sec.split("\n");
    // Exclude table rows and bullets for narrative check
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

// ─────────────────────────────────────────────────────────────────────────────
// Main Export
// ─────────────────────────────────────────────────────────────────────────────
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

  // Try mini first
  try {
    const resp = await callLLM(msgs, "gpt-4o-mini");
    raw = resp;
    modelUsed = resp.model ?? "gpt-4o-mini";
    tokensUsed = resp.usage?.total_tokens ?? null;
    promptTokens = resp.usage?.prompt_tokens ?? null;
    completionTokens = resp.usage?.completion_tokens ?? null;
    md = resp.choices[0]?.message?.content ?? "";
    if (
      wc(md) >= MIN_WORDS &&
      headingsOK(md) &&
      blueprintOK(md) &&
      citationsOK(md) &&
      narrativesOK(md) &&
      hasEnd(md)
    ) {
      passes = true;
    }
  } catch (err) {
    console.warn("Mini model failed:", err);
  }

  // Fallback to full
  if (!passes) {
    const resp = await callLLM(msgs, "gpt-4o");
    raw = resp;
    modelUsed = resp.model ?? "gpt-4o";
    tokensUsed = resp.usage?.total_tokens ?? null;
    promptTokens = resp.usage?.prompt_tokens ?? null;
    completionTokens = resp.usage?.completion_tokens ?? null;
    md = resp.choices[0]?.message?.content ?? "";
    if (
      wc(md) >= MIN_WORDS &&
      headingsOK(md) &&
      blueprintOK(md) &&
      citationsOK(md) &&
      narrativesOK(md) &&
      hasEnd(md)
    ) {
      passes = true;
    }
  }

  md = ensureEnd(md);

  // Parse → Safety → Affiliate → Evidence
  const parsedItems: StackItem[] = parseStackFromMarkdown(md);

  const safetyInput = {
    medications: Array.isArray(sub.medications)
      ? sub.medications.map((m: any) => m.med_name || "")
      : [],
    conditions: Array.isArray(sub.conditions)
      ? sub.conditions.map((c: any) => c.condition_name || "")
      : [],
    allergies: Array.isArray(sub.allergies)
      ? sub.allergies.map((a: any) => a.allergy_name || "")
      : [],
    pregnant:
      typeof (sub as any).pregnant === "boolean" || typeof (sub as any).pregnant === "string"
        ? (sub as any).pregnant
        : null,
    brand_pref: (sub as any)?.preferences?.brand_pref ?? null,
    dosing_pref: (sub as any)?.preferences?.dosing_pref ?? null,
  };

  // Safety checks may add cautions and drop unsafe items
  const { cleaned } = await applySafetyChecks(safetyInput, parsedItems);

  // Affiliate enrichment may add links + cost_estimate
  const finalStack: StackItem[] = await enrichAffiliateLinks(cleaned);

  // Evidence curation/validation step (curated wins; otherwise keep valid PubMed/DOI from model)
  const withEvidence: StackItem[] = finalStack.map(attachEvidence);

  // Optional telemetry
  try {
    const curatedCount = withEvidence.filter((it) => (it.citations?.length ?? 0) > 0).length;
    // eslint-disable-next-line no-console
    console.log(`evidence.curated ${curatedCount}/${withEvidence.length}`);
  } catch {
    // no-op
  }

  // Calculate total cost from enriched items
  const totalMonthlyCost = withEvidence.reduce(
    (acc, it) => acc + (it.cost_estimate ?? 0),
    0
  );

  // Upsert into stacks (now with tally_submission_id, summary, sections, cost)
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
          summary: md, // NOTE: consider TEXT/LONGTEXT in DB to avoid truncation
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

  // Insert stacks_items (single source of truth)
  if (parentRows.length > 0) {
    const parent = parentRows[0];
    if (parent?.id && user_id) {
      // Wipe existing rows for this stack_id (idempotent re-gen)
      await supabaseAdmin.from("stacks_items").delete().eq("stack_id", parent.id);

      const rows = withEvidence
        .map((it) => {
          const safeName = cleanName(it?.name ?? "");
          if (!safeName || safeName.toLowerCase() === "null") {
            console.error("🚨 Blocking insert of invalid item", {
              stack_id: parent.id,
              user_id,
              rawName: it?.name,
              item: it,
            });
            return null;
          }
          return {
            stack_id: parent.id,
            user_id,
            user_email: userEmail,
            name: safeName,
            dose: it.dose ?? null,
            timing: it.timing ?? null,
            notes: it.notes ?? null,
            rationale: it.rationale ?? null,
            caution: it.caution ?? null,
            citations: it.citations ? JSON.stringify(it.citations) : null,
            link_amazon: it.link_amazon ?? null,
            link_fullscript: it.link_fullscript ?? null,
            link_thorne: it.link_thorne ?? null,
            link_other: it.link_other ?? null,
            cost_estimate: it.cost_estimate ?? null,
          };
        })
        .filter((r) => r !== null);

      console.log("✅ Prepared stack_items rows:", rows);

      if (rows.length > 0) {
        const { error } = await supabaseAdmin.from("stacks_items").insert(rows as any[]);
        if (error) console.error("⚠️ Failed to insert stacks_items:", error);
        else console.log(`✅ Inserted ${rows.length} stack items for stack ${parent.id}`);
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
