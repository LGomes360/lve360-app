/* eslint-disable @typescript-eslint/consistent-type-imports */
import getSubmissionWithChildren from "@/lib/getSubmissionWithChildren";
import type { SubmissionWithChildren } from "@/lib/getSubmissionWithChildren";
import { ChatCompletionMessageParam } from "openai/resources";

// ------- constants -------
const TODAY          = "2025-09-21";
const MIN_WORDS      = 1600;
const MIN_BP_ROWS    = 10;
const MAX_RETRIES    = 2;      // one retry + final throw

// ------- helpers -------
function calcAge(dob: string | null) {
  if (!dob) return null;
  const d = new Date(dob), t = new Date(TODAY);
  let a = t.getFullYear() - d.getFullYear();
  if (t < new Date(t.getFullYear(), d.getMonth(), d.getDate())) a--;
  return a;
}

function firstName(full: string | null) {
  return full ? full.split(/\s+/)[0] : "there";
}

// ------- prompt builders -------
function systemPrompt() {
  return `
You are **LVE360 Concierge AI**.

Return **Markdown only** with headings exactly:
## Summary
## Goals
## Contraindications & Med Interactions
## Current Stack
## High-Impact “Bang-for-Buck” Additions
## Recommended Stack
## Dosing & Notes
## Evidence & References
## Shopping Links
## Follow-up Plan
## Lifestyle Prescriptions
## Longevity Levers
## This Week Try
## END

### Quality rules
• ≥ ${MIN_WORDS} words total.  
• “High-Impact” **must** be a Markdown table \`| Rank | Supplement | Why it matters |\` with **≥ ${MIN_BP_ROWS} rows**.  
• Every supplement listed in sections 5–7 requires ≥1 inline citation containing a **clickable PubMed or DOI URL** (e.g. https://pubmed.ncbi.nlm.nih.gov/12345678/).  
• In *Recommended Stack* tag items that exist in *Current Stack* with **(already using)**.  
• After *Current Stack* table include a paragraph titled **“How your current stack is working”** summarising benefits & gaps.  
• After *Recommended Stack* table include a paragraph titled **“Synergy & Timing”** describing how items work together and when to take them.  
• Write the Summary in **second person**, greet the client by first name, and start with an encouraging sentence that contains at most **one emoji**.  
• Tone: supportive, DSHEA-compliant.  
• Finish with a line containing only \`## END\`.

If any rule is unmet, regenerate internally.`;
}

function userPrompt(sub: SubmissionWithChildren) {
  return `
### CLIENT PROFILE
\`\`\`json
${JSON.stringify(
  { ...sub, age: calcAge((sub as any).dob ?? null), today: TODAY },
  null,
  2
)}
\`\`\`

### TASK
Produce the full report following the headings & rules above.`;
}

// ------- OpenAI call -------
async function openAI(messages: ChatCompletionMessageParam[]) {
  const { default: OpenAI } = await import("openai");
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
  return openai.chat.completions.create({
    model: process.env.OPENAI_MODEL ?? "gpt-4o",
    temperature: 0.8,
    max_tokens: 4096,
    messages,
  });
}

// ------- post-generation guards -------
const wc      = (txt: string) => txt.trim().split(/\s+/).length;
const hasEnd  = (md: string) => md.includes("## END");
const blueprintOK = (md: string) => {
  const m = md.match(/## High-Impact[\s\S]*?\n\|/i);
  if (!m) return false;
  const rows = m[0].split("\n").filter(r => r.startsWith("|"));
  return rows.length >= MIN_BP_ROWS + 1; // header + rows
};

function ensureEnd(md: string) {
  return hasEnd(md) ? md : md + "\n\n## END";
}

function salvageBlueprint(md: string) {
  // pull first 10 items (table row OR bullet) from Recommended Stack
  const block = md.match(
    /## Recommended Stack([\s\S]*?)(\n## |\n## END|$)/i
  );
  if (!block) return null;

  const lines = block[1]
    .split("\n")
    .map(l => l.trim())
    .filter(Boolean)
    .filter(l => l.startsWith("|") || l.startsWith("-") || /^\d+\./.test(l))
    .slice(0, MIN_BP_ROWS);

  if (!lines.length) return null;

  const rows = lines.map((l, i) => {
    const clean = l
      .replace(/^\|/,"")
      .replace(/^\d+\.\s*/,"")
      .replace(/^-+\s*/,"")
      .split("|")[0]
      .trim();
    return `| ${i + 1} | ${clean} | Auto-generated placeholder |`;
  });

  return [
    "## High-Impact “Bang-for-Buck” Additions",
    "",
    "| Rank | Supplement | Why it matters |",
    "| ---- | ---------- | -------------- |",
    ...rows,
    ""
  ].join("\n");
}

// ------- main export -------
export async function generateStackForSubmission(submissionId: string) {
  if (!submissionId) throw new Error("submissionId required");
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY missing");

  const sub = await getSubmissionWithChildren(submissionId);

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt() },
    { role: "user",   content: userPrompt(sub)  }
  ];

  let attempt = 0;
  let md      = "";
  let rawResp: any = null;

  while (attempt < MAX_RETRIES) {
    const resp = await openAI(messages);
    rawResp = resp;
    md = resp.choices[0]?.message?.content ?? "";
    if (
      wc(md) >= MIN_WORDS &&
      blueprintOK(md) &&
      hasEnd(md)
    )
      break;            // passes all guards
    attempt++;
  }

  // final salvage if blueprint still missing
  if (!blueprintOK(md)) {
    const fallback = salvageBlueprint(md);
    if (fallback)
      md = md.replace(/## High-Impact[\s\S]*?(?=\n## |\n## END|$)/i, fallback)
             .replace("## Recommended Stack", fallback + "\n\n## Recommended Stack");
  }

  md = ensureEnd(md);
  if (!md.trim()) md = "## Report Unavailable\n\n## END";

  return { markdown: md, raw: rawResp };
}

export default generateStackForSubmission;
