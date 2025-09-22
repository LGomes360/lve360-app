/* eslint-disable @typescript-eslint/consistent-type-imports */
import getSubmissionWithChildren from "@/lib/getSubmissionWithChildren";
import type { SubmissionWithChildren } from "@/lib/getSubmissionWithChildren";
import { ChatCompletionMessageParam } from "openai/resources";

// ── constants ───────────────────────────────────────
const TODAY              = "2025-09-21";
const MIN_WORDS          = 1600;
const MIN_BP_ROWS        = 10;
const MAX_RETRIES        = 2;
const CITE_RE            = /(https?:\/\/(?:pubmed\.ncbi\.nlm\.nih\.gov|doi\.org)\/[^\s)]+)/i;

// ── helpers ─────────────────────────────────────────
const wc      = (t: string) => t.trim().split(/\s+/).length;
const hasEnd  = (t: string) => t.includes("## END");
const seeDose = "See Dosing & Notes";

function calcAge(dob: string | null) {
  if (!dob) return null;
  const b = new Date(dob), t = new Date(TODAY);
  let a = t.getFullYear() - b.getFullYear();
  if (t < new Date(t.getFullYear(), b.getMonth(), b.getDate())) a--;
  return a;
}

/* Replace generic URLs with branded affiliate links — stub */
async function enrichAffiliateLinks(markdown: string): Promise<string> {
  // TODO: call your affiliate catalog here; simple replacement for now
  return markdown.replace(/https?:\/\/www\.amazon\.com\/s\?[^)\s]*/g, match => {
    const encoded = encodeURIComponent(match);
    return `https://mylink.example.com/track?url=${encoded}`;
  });
}

// ── prompt builders ────────────────────────────────
function systemPrompt() {
  return `
You are **LVE360 Concierge AI**.

Return **Markdown only** with headings exactly:
## Summary
## Goals
## Contraindications & Med Interactions
## Current Stack
## High-Impact "Bang-for-Buck" Additions
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
2. **High-Impact table** (\`| Rank | Supplement | Why it matters |\`) **≥ ${MIN_BP_ROWS} unique rows**. Exclude items tagged *(already using)* unless ROI ranks it #1. Each "Why" cell ≤12 words, must not contain “placeholder/auto/blank”.  
3. Immediately after the table add **“Why these 10 matter”** paragraph (≥ 2 sentences personalised to goals).  
4. **Recommended Stack** must be a table. If a Dose or Timing cell is blank, fill **"${seeDose}"**. After the table add **“Synergy & Timing”** paragraph.  
5. Tag items already in *Current Stack* inside Recommended table with **(already using)**.  
6. **Every bullet** in *Evidence & References* ends with a clickable PubMed or DOI URL.  
7. Summary greets first name (second person, one emoji max).  
8. Finish with line \`## END\`.  
If any rule is unmet, regenerate internally.`;
}

function userPrompt(sub: SubmissionWithChildren) {
  return `
### CLIENT PROFILE
\`\`\`json
${JSON.stringify({ ...sub, age: calcAge((sub as any).dob ?? null), today: TODAY }, null, 2)}
\`\`\`

### TASK
Write the full report exactly per headings & rules.`;
}

// ── OpenAI wrapper ────────────────────────────────
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

// ── validation helpers ────────────────────────────
function blueprintTableOK(md: string) {
  const sec = md.match(/## High-Impact[\s\S]*?\n\|/i);
  if (!sec) return false;
  const rows = sec[0]
    .split("\n")
    .filter((l: string) => l.startsWith("|"))
    .slice(1); // exclude header
  const unique = new Set<string>();
  rows.forEach((r: string) => unique.add(r.split("|")[2]?.trim().toLowerCase()));
  const hasPlaceholder = rows.some((r: string) =>
    /placeholder|auto/i.test(r.split("|")[3] || "")
  );
  return (
    rows.length >= MIN_BP_ROWS &&
    unique.size >= MIN_BP_ROWS &&
    !hasPlaceholder
  );
}

function blueprintNarrativeOK(md: string) {
  const m = md.match(/Why these 10 matter[\s\S]*?(\n## |\n## END|$)/i);
  if (!m) return false;
  return m[0].split(/[.!?]/).filter((s: string) => s.trim()).length >= 2;
}

function citationsOK(md: string) {
  const block = md.match(
    /## Evidence & References([\s\S]*?)(\n## |\n## END|$)/i
  );
  if (!block) return false;
  return block[1]
    .split("\n")
    .filter((l: string) => l.trim().startsWith("-"))
    .every((l: string) => CITE_RE.test(l));
}

function ensureEnd(md: string) {
  return hasEnd(md) ? md : md + "\n\n## END";
}

// ── salvage High-Impact table if still bad ─────────
function harvestRecs(md: string) {
  const sec = md.match(/## Recommended Stack([\s\S]*?)(\n## |\n## END|$)/i);
  if (!sec) return [];
  return sec[1]
    .split("\n")
    .map((l: string) => l.trim())
    .filter(Boolean)
    .filter((l: string) => l.startsWith("|") || l.startsWith("-") || /^\d+\./.test(l))
    .map((l: string) => l.replace(/\(already using\)/i, "").replace(/^[-\d.]+\s*/, "").replace(/^\|/, "").split("|")[0].trim());
}

function injectBlueprint(md: string) {
  const names = harvestRecs(md)
    .filter((n: string, i: number, arr: string[]) => arr.indexOf(n) === i)
    .slice(0, MIN_BP_ROWS);

  if (names.length < MIN_BP_ROWS) return md;

  const table = [
    "## High-Impact \"Bang-for-Buck\" Additions",
    "",
    "| Rank | Supplement | Why it matters |",
    "| ---- | ---------- | -------------- |",
    ...names.map(
      (n: string, i: number) =>
        `| ${i + 1} | ${n} | Complements goals & fills a gap |`
    ),
    "",
    "**Why these 10 matter:** These supplements deliver the highest marginal benefit for your stated goals while respecting safety constraints.",
    "",
  ].join("\n");

  if (/## High-Impact/i.test(md))
    return md.replace(/## High-Impact[\s\S]*?(?=\n## |\n## END|$)/i, table);
  return md.replace("## Recommended Stack", table + "\n## Recommended Stack");
}

// ── ensure Recommended table shape ────────────────
function ensureRecTable(md: string) {
  if (/## Recommended Stack[\s\S]*?\n\|/i.test(md)) {
    // fill blank cells
    return md.replace(
      /## Recommended Stack([\s\S]*?)(\n## |\n## END)/i,
      (_: string, body: string, tail: string) => {
        const fixed = body
          .split("\n")
          .map((l: string) =>
            l.startsWith("|") && /\|\s*\|\s*\|/.test(l)
              ? l.replace(/\|\s*\|\s*\|/, `| ${seeDose} | — |`)
              : l
          )
          .join("\n");
        return "## Recommended Stack" + fixed + tail;
      }
    );
  }

  // convert list to table
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
        ...lines.map((txt: string) => `| ${txt} | ${seeDose} | — |`),
      ].join("\n");

      return `## Recommended Stack\n\n${table}\n\n**Synergy & Timing:** These supplements have been staged AM vs PM for best absorption.\n\n${end.trimStart()}`;
    }
  );
}

// ── main export ───────────────────────────────────
export async function generateStackForSubmission(submissionId: string) {
  if (!submissionId) throw new Error("submissionId required");
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY missing");

  const submission = await getSubmissionWithChildren(submissionId);

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt() },
    { role: "user", content: userPrompt(submission) },
  ];

  let attempt = 0;
  let markdown = "";
  let rawResp: any = null;

  while (attempt < MAX_RETRIES) {
    const resp = await callLLM(messages);
    rawResp = resp;
    markdown = resp.choices[0]?.message?.content ?? "";

    if (
      wc(markdown) >= MIN_WORDS &&
      blueprintTableOK(markdown) &&
      blueprintNarrativeOK(markdown) &&
      citationsOK(markdown) &&
      hasEnd(markdown)
    )
      break;

    attempt++;
  }

  // salvage + formatting fixes
  if (!blueprintTableOK(markdown)) markdown = injectBlueprint(markdown);
  markdown = ensureRecTable(markdown);
  markdown = ensureEnd(markdown);

  // final guards
  if (
    wc(markdown) < MIN_WORDS ||
    !blueprintTableOK(markdown) ||
    !blueprintNarrativeOK(markdown) ||
    !citationsOK(markdown)
  ) {
    throw new Error("Quality guards failed after salvage; Vercel will retry");
  }

  // affiliate link enrichment
  markdown = await enrichAffiliateLinks(markdown);

  return { markdown, raw: rawResp };
}

export default generateStackForSubmission;
