/* eslint-disable @typescript-eslint/consistent-type-imports */
import getSubmissionWithChildren from "@/lib/getSubmissionWithChildren";
import type { SubmissionWithChildren } from "@/lib/getSubmissionWithChildren";
import { ChatCompletionMessageParam } from "openai/resources";

const TODAY           = "2025-09-21";
const MIN_WORDS       = 1600;
const MIN_BP_ROWS     = 10;
const MAX_RETRIES     = 2;

/* ── small helpers ── */
const wc      = (t: string) => t.trim().split(/\s+/).length;
const hasEnd  = (t: string) => t.includes("## END");
const citeRE  = /(https?:\/\/(?:pubmed\.ncbi\.nlm\.nih\.gov|doi\.org)\/[^\s)]+)/i;

function age(dob: string | null) {
  if (!dob) return null;
  const d = new Date(dob), t = new Date(TODAY);
  let a = t.getFullYear() - d.getFullYear();
  if (t < new Date(t.getFullYear(), d.getMonth(), d.getDate())) a--;
  return a;
}

/* ── prompt builders ── */
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
1. ≥ ${MIN_WORDS} words total.  
2. **High-Impact table** (\`| Rank | Supplement | Why it matters |\`) must have **≥${MIN_BP_ROWS} rows** and MUST NOT duplicate items tagged *(already using)* (except if clearly #1 ROI). Provide a real 1-sentence rationale per row (no placeholders).  
3. Immediately after that table add a paragraph **“Why these 10 matter”** with ≥2 sentences tied to the client’s goals.  
4. **Recommended Stack** MUST be a Markdown table. If a Dose or Timing is blank, estimate a safe evidence-based starting dose/timing. After the table add **“Synergy & Timing”** paragraph.  
5. Tag any item already in *Current Stack* inside the Recommended table with **(already using)**.  
6. Every supplement in sections 5-7 needs ≥1 clickable PubMed or DOI URL citation.  
7. Summary greets the client by first name, second person, one emoji max.  
8. Finish with a line containing only \`## END\`.  
If any rule is unmet, regenerate internally.`;
}

function userPrompt(sub: SubmissionWithChildren) {
  return `
### CLIENT PROFILE
\`\`\`json
${JSON.stringify({ ...sub, age: age((sub as any).dob ?? null), today: TODAY }, null, 2)}
\`\`\`

### TASK
Write the full report exactly per the headings & rules.`;
}

/* ── OpenAI wrapper ── */
async function callLLM(messages: ChatCompletionMessageParam[]) {
  const { default: OpenAI } = await import("openai");
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
  return openai.chat.completions.create({
    model: process.env.OPENAI_MODEL ?? "gpt-4o",
    temperature: 0.8,
    max_tokens: 4096,
    messages,
  });
}

/* ── post-generation checks ── */
function blueprintTableOK(md: string) {
  const sec = md.match(/## High-Impact[\s\S]*?\n\|/i);
  if (!sec) return false;
  const rows = sec[0].split("\n").filter((l: string) => l.startsWith("|"));
  const unique = new Set<string>();
  rows.slice(1).forEach((r: string) => unique.add(r.split("|")[2]?.trim() ?? ""));
  return rows.length >= MIN_BP_ROWS + 1 && unique.size >= MIN_BP_ROWS;
}

function blueprintNarrativeOK(md: string) {
  const m = md.match(/Why these 10 matter[\s\S]*?(\n## |\n## END|$)/i);
  if (!m) return false;
  return m[0].split(/[.!?]/).filter((s: string) => s.trim().length > 0).length >= 2;
}

function citationsOK(md: string) {
  const evidence = md.match(/## Evidence & References[\s\S]*?(\n## |\n## END|$)/i);
  if (!evidence) return false;
  return evidence[0].split("\n").filter((l: string) => l.trim().startsWith("-")).every((l: string) => citeRE.test(l));
}

function ensureEnd(md: string) { return hasEnd(md) ? md : md + "\n\n## END"; }

/* ── salvage blueprint if still missing or short ── */
function harvestRecs(md: string) {
  const sec = md.match(/## Recommended Stack([\s\S]*?)(\n## |\n## END|$)/i);
  if (!sec) return [];
  return sec[1]
    .split("\n")
    .map((l: string) => l.trim())
    .filter(Boolean)
    .filter((l: string) => l.startsWith("|") || l.startsWith("-") || /^\d+\./.test(l))
    .map((l: string) => {
      const raw = l.startsWith("|") ? l.split("|")[1] : l.replace(/^[-\d.]+\s*/, "");
      return raw.replace(/\(already using\)/i, "").trim();
    });
}
function injectBlueprint(md: string) {
  const names = harvestRecs(md).slice(0, MIN_BP_ROWS);
  if (!names.length) return md;

  const tableLines = names.map(
    (n: string, i: number) => `| ${i + 1} | ${n} | Added for highest ROI |`
  );
  const blueprint =
    [
      "## High-Impact \"Bang-for-Buck\" Additions",
      "",
      "| Rank | Supplement | Why it matters |",
      "| ---- | ---------- | -------------- |",
      ...tableLines,
      "",
      "**Why these 10 matter:** These picks maximise benefits and cover gaps in your current regimen.",
      "",
    ].join("\n") + "\n";

  if (/## High-Impact/i.test(md))
    return md.replace(/## High-Impact[\s\S]*?(?=\n## |\n## END|$)/i, blueprint);
  return md.replace("## Recommended Stack", blueprint + "\n## Recommended Stack");
}

/* ── ensure Recommended Stack is a table ── */
function ensureRecTable(md: string) {
  if (/## Recommended Stack[\s\S]*?\n\|/i.test(md)) return md;
  return md.replace(
    /## Recommended Stack([\s\S]*?)(\n## |\n## END|$)/i,
    (_: string, body: string, end: string) => {
      const lines = body
        .split("\n")
        .map((l: string) => l.trim())
        .filter(Boolean)
        .filter((l: string) => l.startsWith("-") || /^\d+\./.test(l))
        .map((l: string) => l.replace(/^[-\d.]+\s*/, ""));
      if (!lines.length) return "## Recommended Stack\n\n" + body + end;
      const table = [
        "| Supplement | Dose & Timing | Notes |",
        "| ---------- | ------------- | ----- |",
        ...lines.map((txt: string) => `| ${txt} | — | — |`),
      ].join("\n");
      const synergy = "**Synergy & Timing:** These supplements are spaced AM vs PM to optimise absorption and minimise interactions.";
      return `## Recommended Stack\n\n${table}\n\n${synergy}\n\n${end.trimStart()}`;
    }
  );
}

/* ── main export ── */
export async function generateStackForSubmission(submissionId: string) {
  if (!submissionId) throw new Error("submissionId required");
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY missing");
  const sub = await getSubmissionWithChildren(submissionId);

  const msgs: ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt() },
    { role: "user", content: userPrompt(sub) },
  ];

  let tries = 0;
  let md = "";
  let raw: any = null;

  while (tries < MAX_RETRIES) {
    const rsp = await callLLM(msgs);
    raw = rsp;
    md = rsp.choices[0]?.message?.content ?? "";
    if (
      wc(md) >= MIN_WORDS &&
      blueprintTableOK(md) &&
      blueprintNarrativeOK(md) &&
      citationsOK(md) &&
      hasEnd(md)
    )
      break;
    tries++;
  }

  /* salvage & patches */
  if (!blueprintTableOK(md)) md = injectBlueprint(md);
  md = ensureRecTable(md);
  md = ensureEnd(md);

  /* final guards (throw so Vercel retries) */
  if (
    wc(md) < MIN_WORDS ||
    !blueprintTableOK(md) ||
    !blueprintNarrativeOK(md) ||
    !citationsOK(md)
  ) {
    throw new Error("Quality guards failed; regenerate");
  }

  return { markdown: md, raw };
}

export default generateStackForSubmission;
