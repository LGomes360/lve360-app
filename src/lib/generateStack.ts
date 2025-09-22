/* eslint-disable @typescript-eslint/consistent-type-imports */
import getSubmissionWithChildren from "@/lib/getSubmissionWithChildren";
import type { SubmissionWithChildren } from "@/lib/getSubmissionWithChildren";
import { ChatCompletionMessageParam } from "openai/resources";

// future stubs (currently no-ops)
import { applySafetyChecks } from "@/lib/safetyCheck";
import { enrichAffiliateLinks } from "@/lib/affiliateLinks";

// ── constants ──────────────────────────────────────────
const TODAY           = "2025-09-21";
const MIN_WORDS       = 1800;
const MIN_BP_ROWS     = 10;
const MAX_RETRIES     = 3;
const CITE_RE         = /(https?:\/\/(?:pubmed\.|doi\.org)[^\s)]+)/i;

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
  "## Disclaimers",
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

function userPrompt(sub: SubmissionWithChildren, attempt = 0) {
  let reminder = "";
  if (attempt === 1) {
    reminder = "\n\n⚠️ Reminder: Include ≥10 unique Blueprint rows and ≥3 sentences of Analysis per section in friendly coach tone.";
  }
  if (attempt === 2) {
    reminder = "\n\n‼️ STRICT: Must include all 13 headings, ≥10 Blueprint rows, and ≥3 sentences of Analysis per section.";
  }

  return `
### CLIENT
\`\`\`json
${JSON.stringify({ ...sub, age: age((sub as any).dob ?? null), today: TODAY }, null, 2)}
\`\`\`

### TASK
Generate the full 13-section report per the rules above.${reminder}`;
}

// ── openai wrapper ──────────────────────────────────
async function callLLM(messages: ChatCompletionMessageParam[]) {
  const { default: OpenAI } = await import("openai");
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
  return openai.chat.completions.create({
    model       : process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    temperature : 0.7,
    max_tokens  : 4096,
    messages,
  });
}

// ── validation helpers ──────────────────────────────
function headingsOK(md: string) {
  return HEADINGS.slice(0, -1).every(h => md.includes(h));
}
function blueprintOK(md: string) {
  const sec = md.match(/## Your Blueprint Recommendations[\s\S]*?\n\|/i);
  if (!sec) return false;
  const rows = sec[0].split("\n").filter(l => l.startsWith("|")).slice(1);
  const unique = new Set<string>();
  const noPlaceholder = rows.every(r => !/placeholder|auto/i.test(r));
  rows.forEach(r => unique.add(r.split("|")[2]?.trim().toLowerCase()));
  return rows.length >= MIN_BP_ROWS && unique.size >= MIN_BP_ROWS && noPlaceholder;
}
function citationsOK(md: string) {
  const block = md.match(/## Evidence & References([\s\S]*?)(\n## |\n## END|$)/i);
  if (!block) return false;
  return block[1]
    .split("\n")
    .filter(l => l.trim().startsWith("-"))
    .every(l => CITE_RE.test(l));
}

// section-level narrative check (≥3 sentences)
function narrativesOK(md: string) {
  const sections = md.split("\n## ").slice(1); // skip preamble
  return sections.every(sec => {
    const lines = sec.split("\n");
    const textBlock = lines.filter(l => !l.startsWith("|") && !l.startsWith("-")).join(" ");
    const sentences = textBlock.split(/[.!?]/).filter(s => s.trim().length > 0);
    return sentences.length >= 3;
  });
}

function ensureEnd(md: string) { return hasEnd(md) ? md : md + "\n\n## END"; }

// ── main export ─────────────────────────────────────
export async function generateStackForSubmission(id: string) {
  if (!id) throw new Error("submissionId required");
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY missing");

  const sub = await getSubmissionWithChildren(id);

  let md = "";
  let raw: any = null;
  let passes = false;

  for (let i = 0; i < MAX_RETRIES; i++) {
    const msgs: ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt() },
      { role: "user",   content: userPrompt(sub, i) },
    ];
    const resp = await callLLM(msgs);
    raw = resp;
    md  = resp.choices[0]?.message?.content ?? "";

    if (
      wc(md) >= MIN_WORDS &&
      headingsOK(md) &&
      blueprintOK(md) &&
      citationsOK(md) &&
      narrativesOK(md) &&
      hasEnd(md)
    ) {
      passes = true;
      break;
    }
  }

  // salvage minimal
  md = ensureEnd(md);

  // apply hooks
  md = await applySafetyChecks(md, sub);
  md = await enrichAffiliateLinks(md);

  if (!passes) {
    console.warn("⚠️ Draft validation failed, review needed.");
  }

  return { markdown: md, raw };
}

export default generateStackForSubmission;
