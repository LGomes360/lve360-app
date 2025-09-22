/* eslint-disable @typescript-eslint/consistent-type-imports */
import getSubmissionWithChildren from "@/lib/getSubmissionWithChildren";
import type { SubmissionWithChildren } from "@/lib/getSubmissionWithChildren";
import { ChatCompletionMessageParam } from "openai/resources";

// ── constants ──────────────────────────────────────────
const TODAY           = "2025-09-21";
const MIN_WORDS       = 1800;
const MIN_BP_ROWS     = 10;
const MAX_RETRIES     = 2;
const CITE_RE         = /(https?:\/\/(?:pubmed\.|doi\.org)[^\s)]+)/i;

// exact headings
const HEADINGS = [
  "## Intro Summary",
  "## Goals",
  "## Contraindications & Med Interactions",
  "## Current Stack",
  "## Your Blueprint Recommendations",
  "## Full Recommended Stack",
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

// helpers
const wc     = (t: string) => t.trim().split(/\s+/).length;
const hasEnd = (t: string) => t.includes("## END");
const seeDN  = "See Dosing & Notes";

// age calc
function age(dob: string | null) {
  if (!dob) return null;
  const d = new Date(dob), t = new Date(TODAY);
  let a = t.getFullYear() - d.getFullYear();
  if (t < new Date(t.getFullYear(), d.getMonth(), d.getDate())) a--;
  return a;
}

// simple affiliate stub
async function enrichLinks(md: string) {
  return md.replace(/https?:\/\/www\.amazon\.com\/s\?[^)\s]*/g, m =>
    `https://mytag.example.com?url=${encodeURIComponent(m)}`
  );
}

// ── prompt builders ───────────────────────────────────
function systemPrompt() {
  return `
You are **LVE360 Concierge AI**, a friendly but professional wellness coach.  
Tone: encouraging, plain-English, never clinical or robotic.  
Always explain *why it matters* in a supportive, human way.

Return **plain ASCII Markdown only** with headings EXACTLY:

${HEADINGS.slice(0, -1).join("\n")}

Tables must use \`Column | Column\` pipe format, **no curly quotes or bullets**.
Every table/list MUST be followed by **Analysis** ≥3 sentences that:
• Summarize the section  
• Explain why it matters  
• Give practical implication  

### Special rules
• Section **Your Blueprint Recommendations** → table with ≥${MIN_BP_ROWS} rows (Rank 1-10, Supplement, Why it Matters ≤12 words, no placeholders/auto).  
  Exclude items tagged *(already using)* unless it is Rank 1.  
• Section **Evidence & References** – every bullet ends with PubMed/DOI URL.  
• Empty Dose/Timing → “${seeDN}”.  
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
Generate the full 14-section report per the rules above.`;
}

// ── openai wrapper ───────────────────────────────────
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

// ── validation helpers ───────────────────────────────
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
function ensureEnd(md: string) { return hasEnd(md) ? md : md + "\n\n## END"; }

// convert bullet lists in Recommended → pipe table
function ensureRecTable(md: string) {
  return md.replace(
    /## Full Recommended Stack([\s\S]*?)(\n## |\n## END|$)/i,
    (_, body: string, tail: string) => {
      if (/\n\|.+\|\s*Notes\s*\|/i.test(body)) return "## Full Recommended Stack" + body + tail;
      const lines = body
        .split("\n")
        .filter(l => l.trim() && (l.startsWith("-") || /^\d+\./.test(l)))
        .map(l => l.replace(/^[-\d.]+\s*/, ""));
      if (!lines.length) return "## Full Recommended Stack\n\n" + body + tail;
      const tbl = [
        "| Supplement | Dose & Timing | Notes |",
        "| ---------- | ------------- | ----- |",
        ...lines.map(txt => `| ${txt} | ${seeDN} | — |`),
      ].join("\n");
      return `## Full Recommended Stack\n\n${tbl}\n\n${tail.trimStart()}`;
    }
  );
}

// ── main export ─────────────────────────────────────
export async function generateStackForSubmission(id: string) {
  if (!id) throw new Error("submissionId required");
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY missing");

  const sub  = await getSubmissionWithChildren(id);
  const msgs: ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt() },
    { role: "user",   content: userPrompt(sub) },
  ];

  let md = "";
  let raw: any = null;
  for (let i = 0; i < MAX_RETRIES; i++) {
    const resp = await callLLM(msgs);
    raw = resp;
    md  = resp.choices[0]?.message?.content ?? "";
    if (
      wc(md) >= MIN_WORDS &&
      headingsOK(md) &&
      blueprintOK(md) &&
      citationsOK(md) &&
      hasEnd(md)
    ) break;
  }

  // salvage minimal: fix missing end + ensure rec table
  md = ensureRecTable(md);
  md = ensureEnd(md);

  // final soft-guard banner
  const fails: string[] = [];
  if (wc(md) < MIN_WORDS) fails.push("word-count");
  if (!headingsOK(md))   fails.push("headings");
  if (!blueprintOK(md))  fails.push("blueprint");
  if (!citationsOK(md))  fails.push("citations");

  if (fails.length)
    md = `> **⚠️ Draft needs review** – failed: ${fails.join(", ")}\n\n` + md;

  // add affiliate links
  md = await enrichLinks(md);

  return { markdown: md, raw };
}

export default generateStackForSubmission;
