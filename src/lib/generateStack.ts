/* eslint-disable @typescript-eslint/consistent-type-imports */
import getSubmissionWithChildren from "@/lib/getSubmissionWithChildren";
import type { SubmissionWithChildren } from "@/lib/getSubmissionWithChildren";
import { ChatCompletionMessageParam } from "openai/resources";
import { applySafetyChecks } from "@/lib/safetyCheck";
import { enrichAffiliateLinks } from "@/lib/affiliateLinks";
import { supabaseAdmin } from "@/lib/supabase";  // ✅ Supabase persistence

// ── constants ──────────────────────────────────────────
const TODAY       = "2025-09-21";
const MIN_WORDS   = 1800;
const MIN_BP_ROWS = 10;
const CITE_RE     = /(https?:\/\/(?:pubmed\.|doi\.org)[^\s)]+)/i;

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

// ── helpers ──────────────────────────────────────────
const wc     = (t: string) => t.trim().split(/\s+/).length;
const hasEnd = (t: string) => t.includes("## END");
const seeDN  = "See Dosing & Notes";

function age(dob: string | null) {
  if (!dob) return null;
  const d = new Date(dob), t = new Date(TODAY);
  let a = t.getFullYear() - d.getFullYear();
  if (t < new Date(t.getFullYear(), d.getMonth(), d.getDate())) a--;
  return a;
}

// 👉 Extract user_id for FK insertion into stacks_items
function extractUserId(sub: any): string | null {
  return sub?.user_id ?? (typeof sub.user === "object" ? sub.user?.id : null) ?? null;
}

// ── normalization helpers ────────────────────────────
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
  if (unit === "g") { val = amount * 1000; unit = "mg"; }
  return { amount: val, unit: unit ?? undefined };
}

// ── parse stack from markdown ─────────────────────────
function parseStackFromMarkdown(md: string) {
  const base: Record<string, any> = {};

  // --- 1. Blueprint Recommendations ---
  const blueprint = md.match(/## Your Blueprint Recommendations([\s\S]*?)(\n## |$)/i);
  if (blueprint) {
    const rows = blueprint[1].split("\n").filter(l => l.trim().startsWith("|"));
    rows.slice(1).forEach((row, i) => {
      const cols = row.split("|").map(c => c.trim());
      const name = cols[2] || `Item ${i+1}`;
      base[name.toLowerCase()] = {
        name,
        rationale: cols[3] || undefined,
        dose: null,
        dose_parsed: null,
        timing: null,
      };
    });
  }

  // --- 2. Dosing & Notes ---
  const dosing = md.match(/## Dosing & Notes([\s\S]*?)(\n## |\n## END|$)/i);
  if (dosing) {
    const lines = dosing[1].split("\n").filter(l => l.trim().length > 0);
    for (const line of lines) {
      // Example: "- Vitamin D3 — 2000 IU AM"
      const m = line.match(/[-*]\s*([^—\-:]+)[—\-:]\s*([^,]+)(?:,\s*(.*))?/);
      if (m) {
        const name = m[1].trim();
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

  return Object.values(base);
}

// ── prompt builders ──────────────────────────────────
function systemPrompt() {
  return `
You are **LVE360 Concierge AI**, a friendly but professional wellness coach.
Tone: encouraging, plain-English, never clinical or robotic.
Always explain *why it matters* in a supportive, human way.
Always greet the client by name in the Intro Summary if provided.

Return **plain ASCII Markdown only** with headings EXACTLY:

${HEADINGS.slice(0, -1).join("\n")}

Tables must use \`Column | Column\` pipe format, **no curly quotes or bullets**.
Every table/list MUST be followed by **Analysis** ≥3 sentences that:
• Summarize the section
• Explain why it matters
• Give practical implication

### Section-specific rules
• **Intro Summary** → Must greet by name (if available) and include ≥2–3 sentences.  
• **Goals** → Present as table with columns: Goal | Description, followed by Analysis.  
• **Current Stack** → Always render as table with columns: Medication/Supplement | Purpose | Dosage | Timing.  
• **Your Blueprint Recommendations** → 3-column table: Rank | Supplement | Why it Matters (≤12 words).  
  Must include ≥${MIN_BP_ROWS} unique rows. Do NOT include doses or timing here.  
  Add a single line under the table: *“See Dosing & Notes for amounts and timing.”*  
  Exclude items tagged *(already using)* unless Rank 1.  
• **Dosing & Notes** → List + Analysis explaining amounts, timing, and safety notes.  
• **Evidence & References** → At least 8 bullet points, each ending with a PubMed/DOI URL.  
• **Shopping Links** → Provide links (Amazon/Fullscript/etc.) and brief Analysis of affordability/access.  
• **Follow-up Plan** → Must include at least 3 checkpoints: 6 weeks, 3 months, 6 months.  
• **Lifestyle Prescriptions** → ≥3 actionable lifestyle changes.  
• **Longevity Levers** → ≥3 strategies (nutrition, exercise, sleep, social, cognitive).  
• **This Week Try** → Exactly 3 micro-habits, each 1–2 sentences, easy to implement.  
• If Dose/Timing unknown → use “${seeDN}”.  
• Finish with line \`## END\`.  

If internal check fails, regenerate before responding.`;
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

// ── openai wrapper ──────────────────────────────────
async function callLLM(messages: ChatCompletionMessageParam[], model: string) {
  const { default: OpenAI } = await import("openai");
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
  const resp = await openai.chat.completions.create({
    model,
    temperature: 0.7,
    max_tokens: 4096,
    messages,
  });
  return resp;
}

// ── validation helpers ──────────────────────────────
function headingsOK(md: string) {
  return HEADINGS.slice(0, -1).every(h => md.includes(h));
}

function blueprintOK(md: string) {
  const sec = md.match(/## Your Blueprint Recommendations([\s\S]*?\n\|)/i);
  if (!sec) return false;
  const rows = sec[0].split("\n").filter(l => l.startsWith("|")).slice(1);
  return rows.length >= MIN_BP_ROWS;
}

function citationsOK(md: string) {
  const block = md.match(/## Evidence & References([\s\S]*?)(\n## |\n## END|$)/i);
  if (!block) return false;
  return block[1]
    .split("\n")
    .filter(l => l.trim().startsWith("-"))
    .every(l => CITE_RE.test(l));
}

function narrativesOK(md: string) {
  const sections = md.split("\n## ").slice(1);
  return sections.every(sec => {
    const lines = sec.split("\n");
    const textBlock = lines.filter(l => !l.startsWith("|") && !l.startsWith("-")).join(" ");
    const sentences = textBlock.split(/[.!?]/).filter(s => s.trim().length > 0);

    if (sec.startsWith("Intro Summary") && sentences.length < 2) return false;
    if (!sec.startsWith("Intro Summary") && sentences.length < 3) return false;

    return true;
  });
}

function ensureEnd(md: string) {
  return hasEnd(md) ? md : md + "\n\n## END";
}

// ── main export ─────────────────────────────────────
export async function generateStackForSubmission(id: string) {
  if (!id) throw new Error("submissionId required");
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY missing");

  // -- NEW: Retry for fetching submission (fixes race)
  let sub: SubmissionWithChildren | null = null;
  for (let i = 0; i < 7; i++) {
    sub = await getSubmissionWithChildren(id);
    if (sub) break;
    await new Promise((res) => setTimeout(res, 400)); // Wait 400ms (up to ~2.5s total)
  }
  if (!sub) throw new Error(`Submission row not found for id=${id} after retrying`);

  const user_id = extractUserId(sub);
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

  // --- Step 1: Try gpt-4o-mini first ---
  try {
    const resp = await callLLM(msgs, "gpt-4o-mini");
    raw = resp;
    modelUsed = resp.model ?? "gpt-4o-mini";
    tokensUsed = resp.usage?.total_tokens ?? null;
    promptTokens = resp.usage?.prompt_tokens ?? null;
    completionTokens = resp.usage?.completion_tokens ?? null;
    console.log("LLM call used model:", modelUsed, "usage:", resp.usage);
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
    console.warn("Mini model call failed:", err);
  }

  // --- Step 2: If mini failed, fall back to gpt-4o ---
  if (!passes) {
    console.log("Falling back to gpt-4o for reliability...");
    const resp = await callLLM(msgs, "gpt-4o");
    raw = resp;
    modelUsed = resp.model ?? "gpt-4o";
    tokensUsed = resp.usage?.total_tokens ?? null;
    promptTokens = resp.usage?.prompt_tokens ?? null;
    completionTokens = resp.usage?.completion_tokens ?? null;
    console.log("LLM call used model:", modelUsed, "usage:", resp.usage);
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

  // --- Salvage minimal ---
  md = ensureEnd(md);

  // --- Parse stack items from Markdown ---
  const items = parseStackFromMarkdown(md);

  // --- Run hooks ---
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
    pregnant: typeof sub.pregnant === "boolean" || typeof sub.pregnant === "string"
      ? sub.pregnant
      : null,
    brand_pref: (sub.preferences as any)?.brand_pref ?? null,
    dosing_pref: (sub.preferences as any)?.dosing_pref ?? null,
  };

  const { cleaned, notes } = await applySafetyChecks(safetyInput, items);
  const finalStack = await enrichAffiliateLinks(cleaned);

  // keep md consistent with rest of code
  md = md; // we return original markdown body; items go to stacks_items

  console.log("safety notes", notes);

  // --- Save model + token usage to Supabase ---
  try {
    // 1. Update stack row with model/token info
    await supabaseAdmin
      .from("stacks")
      .update({
        version: modelUsed,
        tokens_used: tokensUsed,
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
      })
      .or(`submission_id.eq.${id},tally_submission_id.eq.${id}`);

    // 2. Fetch parent stack row with retry
    let parentRows: any[] = [];
    let parentErr = null;
    for (let i = 0; i < 7; i++) {
      const { data, error } = await supabaseAdmin
        .from("stacks")
        .select("id")
        .or(`submission_id.eq.${id},tally_submission_id.eq.${id}`);
      if (error) parentErr = error;
      if (data && data.length > 0) {
        parentRows = data;
        break;
      }
      await new Promise(res => setTimeout(res, 400)); // wait 400ms
    }

    if (parentErr) {
      console.error("Supabase update error:", parentErr);
    } else if (!parentRows || parentRows.length === 0) {
      console.warn("⚠️ No stack row found for id (even after retry):", id, parentRows);
    } else {
      console.log("✅ Stack row updated:", parentRows);

      // --- Save stack items ---
      const parent = parentRows[0];
      if (parent?.id && user_id) {
        await supabaseAdmin.from("stacks_items").delete().eq("stack_id", parent.id);

        const rows = finalStack.map((it: any) => ({
          stack_id: parent.id,
          user_id,
          name: it.name,
          dose: it.dose,
          timing: it.timing,
          notes: it.notes,
          rationale: it.rationale,
          caution: it.caution,
          citations: it.citations ? JSON.stringify(it.citations) : null,
          link_amazon: it.link_amazon ?? null,
          link_fullscript: it.link_fullscript ?? null,
          link_thorne: it.link_thorne ?? null,
          link_other: it.link_other ?? null,
          cost_estimate: it.cost_estimate ?? null,
        }));

        if (rows.length > 0) {
          const { error } = await supabaseAdmin.from("stacks_items").insert(rows);
          if (error) console.error("⚠️ Failed to insert stacks_items:", error);
          else console.log(`✅ Inserted ${rows.length} stack items for stack ${parent.id}`);
        }
      }
    }
  } catch (err) {
    console.error("Failed to update Supabase with model/tokens:", err);
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
