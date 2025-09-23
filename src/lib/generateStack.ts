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

### Special rules
• Section **Your Blueprint Recommendations** → table with ≥${MIN_BP_ROWS} rows.
  Exclude items tagged *(already using)* unless it is Rank 1.
• Section **Evidence & References** – every bullet ends with PubMed/DOI URL.
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
  const sec = md.match(/## Your Blueprint Recommendations[\s\S]*?\n\|/i);
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

    // ✅ Special rule: Intro Summary must have ≥2 sentences
    if (sec.startsWith("Intro Summary") && sentences.length < 2) {
      return false;
    }

    // All other sections need ≥3 sentences
    if (!sec.startsWith("Intro Summary") && sentences.length < 3) {
      return false;
    }

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

  const sub = await getSubmissionWithChildren(id);
  const msgs: ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt() },
    { role: "user", content: userPrompt(sub) },
  ];

  let md = "";
  let raw: any = null;
  let modelUsed = "unknown";
  let tokensUsed: number | null = null;
  let passes = false;

  // --- Step 1: Try gpt-4o-mini first ---
  try {
    const resp = await callLLM(msgs, "gpt-4o-mini");
    raw = resp;
    modelUsed = resp.model ?? "gpt-4o-mini";
    tokensUsed = resp.usage?.total_tokens ?? null;
    console.log("LLM call used model:", modelUsed, "tokens:", resp.usage);
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
    console.log("LLM call used model:", modelUsed, "tokens:", resp.usage);
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

  // --- Run hooks ---
  md = await applySafetyChecks(md, sub);
  md = await enrichAffiliateLinks(md);

  // --- Save model + token usage to Supabase ---
  try {
    await supabaseAdmin
      .from("stacks")
      .update({
        version: modelUsed,
        tokens_used: tokensUsed,
      })
      .eq("submission_id", id);
  } catch (err) {
    console.error("Failed to update Supabase with model/tokens:", err);
  }

  if (!passes) {
    console.warn("⚠️ Draft validation failed, review needed.");
  }

  return { markdown: md, raw, model_used: modelUsed, tokens_used: tokensUsed };
}

export default generateStackForSubmission;
