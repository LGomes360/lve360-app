// src/lib/generateStack.ts
// -----------------------------------------------------------------------------
// LVE360 Concierge Report — v3 (two-pass, long-form, ≥10 high-impact items)
// -----------------------------------------------------------------------------

import getSubmissionWithChildren from "@/lib/getSubmissionWithChildren";
import type { SubmissionWithChildren } from "@/lib/getSubmissionWithChildren";

const MAX_PROMPT_CHARS = 26000;
const TODAY_ISO = "2025-09-21";

function safeJson(obj: any) {
  try { return JSON.stringify(obj, null, 2); } catch { return String(obj); }
}

function calcAge(dob: string | null) {
  if (!dob) return null;
  const b = new Date(dob), t = new Date(TODAY_ISO);
  let a = t.getFullYear() - b.getFullYear();
  if (t < new Date(t.getFullYear(), b.getMonth(), b.getDate())) a--;
  return a;
}

function buildSystemPrompt() {
  return `
You are **LVE360**, a wellness-concierge AI (nutritionist/MD hybrid).

## Output Contract (Markdown, strict order)
1. ## Summary
2. ## Goals
3. ## Contraindications & Med Interactions
4. ## Current Stack
5. ## High-Impact “Bang-for-Buck” Additions
6. ## Recommended Stack
7. ## Dosing & Notes
8. ## Evidence & References
9. ## Shopping Links
10. ## Follow-up Plan
11. ## Lifestyle Prescriptions
12. ## Longevity Levers
13. ## This Week Try
14. ## END

### Mandatory quality bars
- ≥ 1 600 words **total** (narrative + bullets) or regenerate.
- **High-Impact section:** ≥ 10 ranked items, table **Rank | Supplement | Why it matters**.
- Every supplement in sections 5–7 must have ≥ 1 inline citation like \`【PMID 123456†10-12】\`.
- Use second person, supportive tone, DSHEA-compliant wording (“may help…”).
- Finish **exactly** with a line containing only \`## END\`.

### Style hints
- Blend short paragraphs (3-5 sentences) with bullets.
- Tie advice to user data (energy score, sleep rating, allergies, meds, etc.).
- In **Shopping Links** use \`[Buy on Fullscript](URL)\` or \`[Link unavailable]\`.
- Include DSHEA disclaimer in **Follow-up Plan**.

Return only Markdown.`;
}

function buildToolPrompt(sub: SubmissionWithChildren) {
  const age = calcAge((sub as any).dob ?? null);
  return {
    role: "user",
    content: `
### USER PROFILE (JSON)
\`\`\`json
${safeJson({
  submission_id: sub.id,
  ...sub,
  age,
  today_iso: TODAY_ISO,
})}
\`\`\`

### TASK
1. Draft an internal JSON object \`draft\` with keys mirroring the 14 sections \
(except END) **plus** helper keys (citations array, wordCount).
2. Immediately transform that \`draft\` into final Markdown \
following the Output Contract **in the same reply**.

Respond with:
\`\`\`json
{ "draft": { ... }, "markdown": "..." }
\`\`\`
`};
}

function enforceGuards(md: string) {
  if (!md.includes("## END")) md += "\n\n## END";
  // crude word count
  if (md.split(/\s+/).length < 1600) md +=
    "\n\n<!-- TOO SHORT — PLEASE REGENERATE WITH ≥1600 WORDS -->";
  if (!md.includes("## High-Impact")) md =
    md.replace("## Recommended Stack", "## High-Impact “Bang-for-Buck” Additions\n\n" +
    "| Rank | Supplement | Why it matters |\n|---|---|---|\n| 1 | Placeholder | TBD |\n\n## Recommended Stack");
  return md;
}

export async function generateStackForSubmission(submissionId: string) {
  if (!submissionId) throw new Error("submissionId is required");
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY missing");

  const submission = await getSubmissionWithChildren(submissionId);

  const systemPrompt = buildSystemPrompt();
  const toolPrompt   = buildToolPrompt(submission);

  // lazy-load OpenAI
  const { default: OpenAI } = await import("openai");
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const chatRes = await openai.chat.completions.create({
    model : process.env.OPENAI_MODEL ?? "gpt-4o",
    messages: [
      { role: "system", content: systemPrompt },
      toolPrompt,
    ],
    temperature: 0.7,
    max_tokens: 4096,
  });

  let markdown = "";
  try {
    const raw = chatRes.choices?.[0]?.message?.content ?? "";
    const parsed = JSON.parse(raw);
    markdown = parsed.markdown ?? raw; // fallback if parse fails
  } catch {
    markdown = chatRes.choices?.[0]?.message?.content ?? "";
  }

  markdown = enforceGuards(markdown);

  if (!markdown.trim()) {
    markdown = `## Report Unavailable

Sorry—our AI couldn’t generate your blueprint at this time.  
Please contact support.

## END`;
  }

  return { markdown, raw: chatRes };
}

export default generateStackForSubmission;
