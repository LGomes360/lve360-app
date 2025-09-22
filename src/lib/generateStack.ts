/* eslint-disable @typescript-eslint/consistent-type-imports */
import getSubmissionWithChildren from "@/lib/getSubmissionWithChildren";
import type { SubmissionWithChildren } from "@/lib/getSubmissionWithChildren";

const TODAY        = "2025-09-21";
const MIN_WORDS    = 1600;
const MIN_BP_ROWS  = 10;

/* ---------- helpers ---------- */
function calcAge(dob: string | null) {
  if (!dob) return null;
  const d = new Date(dob), t = new Date(TODAY);
  let a = t.getFullYear() - d.getFullYear();
  if (t < new Date(t.getFullYear(), d.getMonth(), d.getDate())) a--;
  return a;
}

/* ---------- prompt builders ---------- */
function systemPrompt() {
  return `You are **LVE360 Concierge AI**.

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

Quality rules
• ≥${MIN_WORDS} words total or regenerate.  
• “High-Impact” must be a Markdown table **Rank | Supplement | Why it matters** with **≥${MIN_BP_ROWS} rows**.  
• Every supplement (sections 5-7) needs ≥1 inline citation that contains a **clickable PubMed or DOI URL**, e.g. https://pubmed.ncbi.nlm.nih.gov/12345678/  
• In *Recommended Stack* mark items already in *Current Stack* with **(already using)**.  
• Finish with a line containing only \`## END\`.`;
}

function userPrompt(sub: SubmissionWithChildren) {
  return `
### CLIENT PROFILE
\`\`\`json
${JSON.stringify({ ...sub, age: calcAge((sub as any).dob ?? null), today: TODAY }, null, 2)}
\`\`\`

### TASK
Write the full report following the headings above.`;
}

/* ---------- OpenAI call ---------- */
async function callLLM(messages: any[]) {
  const { default: OpenAI } = await import("openai");
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
  return openai.chat.completions.create({
    model: process.env.OPENAI_MODEL ?? "gpt-4o",
    temperature: 0.8,
    max_tokens: 4096,
    messages,
  });
}

/* ---------- post-gen guards ---------- */
const hasBlueprint = (md: string) => {
  const m = md.match(/## High-Impact[\s\S]*?\n\|/i);
  if (!m) return false;
  const rows = m[0].split("\n").filter(l => l.startsWith("|"));
  return rows.length >= MIN_BP_ROWS + 1; // +1 header
};

const wordCount = (md: string) => md.split(/\s+/).length;

const ensureEnd = (md: string) => (md.includes("## END") ? md : md + "\n\n## END");

/* build fallback table from Recommended Stack (table **or** bullets) */
function fallbackBlueprint(md: string) {
  const block = md.match(/## Recommended Stack([\s\S]*?)(\n## |\n## END|$)/i);
  if (!block) return null;

  const lines = block[1]
    .split("\n")
    .map(l => l.trim())
    .filter(Boolean)
    .filter(l => l.startsWith("|") || l.startsWith("-") || /^\d+\./.test(l))
    .slice(0, MIN_BP_ROWS);

  if (!lines.length) return null;

  const rows = lines.map((l, i) => {
    // strip table pipes or list markers
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

/* enforce word-count, blueprint, END sentinel */
function enforceGuards(md: string) {
  if (wordCount(md) < MIN_WORDS)
    md += `\n\n<!-- TOO SHORT – regenerate with ≥${MIN_WORDS} words -->`;

  if (!hasBlueprint(md)) {
    const bp = fallbackBlueprint(md);
    if (bp) md = md.replace(/## High-Impact[\s\S]*?(?=\n## |\n## END|$)/i, bp);
    else if (!md.includes("## High-Impact"))
      md = md.replace("## Recommended Stack", bp! + "\n\n## Recommended Stack");
  }

  return ensureEnd(md);
}

/* ---------- main export ---------- */
export async function generateStackForSubmission(submissionId: string) {
  if (!submissionId) throw new Error("submissionId required");

  const sub = await getSubmissionWithChildren(submissionId);

  const msgs = [
    { role: "system" as const, content: systemPrompt() },
    { role: "user"   as const, content: userPrompt(sub) }
  ];

  // attempt #1
  let rsp = await callLLM(msgs);
  let md  = rsp.choices[0]?.message?.content ?? "";

  // retry once if guards fail
  if (wordCount(md) < MIN_WORDS || !hasBlueprint(md)) {
    rsp = await callLLM(msgs);
    md  = rsp.choices[0]?.message?.content ?? "";
  }

  md = enforceGuards(md);
  if (!md.trim()) md = "## Report Unavailable\n\n## END";

  return { markdown: md, raw: rsp };
}

export default generateStackForSubmission;
