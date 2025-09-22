/* eslint-disable @typescript-eslint/consistent-type-imports */
import getSubmissionWithChildren from "@/lib/getSubmissionWithChildren";
import type { SubmissionWithChildren } from "@/lib/getSubmissionWithChildren";
const TODAY = "2025-09-21";
const MIN_WORDS = 1600;
const MIN_BP_ROWS = 10;

function age(dob: string | null) {
  if (!dob) return null;
  const d = new Date(dob), t = new Date(TODAY);
  let a = t.getFullYear() - d.getFullYear();
  if (t < new Date(t.getFullYear(), d.getMonth(), d.getDate())) a--;
  return a;
}

function systemPrompt() {
  return `You are **LVE360 Concierge AI**.
Return Markdown only, with headings exactly:
## Summary
## Goals
## Contraindications & Med Interactions
## Current Stack
## High-Impact “Bang-for-Buck” Additions   ← ≥10 ranked rows
## Recommended Stack
## Dosing & Notes
## Evidence & References
## Shopping Links
## Follow-up Plan
## Lifestyle Prescriptions
## Longevity Levers
## This Week Try
## END

Rules
• ≥${MIN_WORDS} words total or regenerate.
• Every supplement (sections 5-7) has ≥1 citation inline like 【PMID 123456†10-12】.
• In **Recommended Stack** mark any item already in Current Stack with *(already using)*.
• Finish with a line containing only "## END".`;
}

function userPrompt(s: SubmissionWithChildren) {
  return `
### CLIENT PROFILE
${JSON.stringify({ ...s, age: age((s as any).dob ?? null), today: TODAY }, null, 2)}

### TASK
Write the full report following the headings above.`;
}

async function callOpenAI(messagePairs: any[]) {
  const { default: OpenAI } = await import("openai");
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
  return openai.chat.completions.create({
    model: process.env.OPENAI_MODEL ?? "gpt-4o",
    temperature: 0.8,
    max_tokens: 4096,
    messages: messagePairs,
  });
}

/* ------- post-gen guards ------- */
function hasBlueprint(md: string) {
  const m = md.match(/## High-Impact[\s\S]*?\n\|/i);
  if (!m) return false;
  const rows = m[0].split("\n").filter(r => r.startsWith("|"));
  return rows.length >= MIN_BP_ROWS + 1; // +1 header row
}
function wordCount(md: string) {
  return md.split(/\s+/).length;
}
function forceEnd(md: string) {
  return md.includes("## END") ? md : md + "\n\n## END";
}
function salvageBlueprint(md: string) {
  const recBlock = md.match(/## Recommended Stack([\s\S]*?)(\n## |$)/i);
  if (!recBlock) return md;
  const rows = recBlock[1]
    .split("\n")
    .filter(l => l.startsWith("|"))
    .slice(0, MIN_BP_ROWS);
  if (!rows.length) return md;
  const table = [
    "| Rank | Supplement | Why it matters |",
    "| ---- | ---------- | -------------- |",
    ...rows.map((r, i) => r.replace(/^(\|[^|]*\|)/, `| ${i + 1} |`)),
  ].join("\n");
  return md.replace(
    "## Recommended Stack",
    "## High-Impact “Bang-for-Buck” Additions\n\n" + table + "\n\n## Recommended Stack"
  );
}

export async function generateStackForSubmission(submissionId: string) {
  if (!submissionId) throw new Error("submissionId required");
  const sub = await getSubmissionWithChildren(submissionId);

  const messages = [
    { role: "system" as const, content: systemPrompt() },
    { role: "user" as const, content: userPrompt(sub) },
  ];

  /* --- first attempt --- */
  let rsp = await callOpenAI(messages);
  let md = rsp.choices[0]?.message?.content ?? "";

  /* --- retry once if guards fail --- */
  if (wordCount(md) < MIN_WORDS || !hasBlueprint(md)) {
    rsp = await callOpenAI(messages);
    md = rsp.choices[0]?.message?.content ?? "";
  }

  /* --- final guardrail patch --- */
  if (!hasBlueprint(md)) md = salvageBlueprint(md);
  md = forceEnd(md);
  if (!md.trim()) md = "## Report Unavailable\n\n## END";

  return { markdown: md, raw: rsp };
}

export default generateStackForSubmission;
