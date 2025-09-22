// src/lib/generateStack.ts
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

/* ---------------- prompts ---------------- */
function systemPrompt() {
  return `You are **LVE360**, a wellness-concierge AI.

## Required Markdown sections
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

Rules:
- ≥1 600 words total.
- “High-Impact” table ≥10 ranked items.
- Every supplement has ≥1 inline citation: 【PMID 123456†10-12】.
- End with exactly \`## END\`.
- DSHEA-compliant tone, second person, blend narrative + bullets.
Return only Markdown.`;
}

function userPrompt(sub: SubmissionWithChildren) {
  const age = calcAge((sub as any).dob ?? null);
  return `
### USER PROFILE
\`\`\`json
${safeJson({ ...sub, age, today_iso: TODAY_ISO })}
\`\`\`

Generate the full report now.`;
}

/* -------------- guard rails -------------- */
function enforce(md: string) {
  if (!md.includes("## END")) md += "\n\n## END";
  if (md.split(/\s+/).length < 1600)
    md += "\n\n<!-- TOO SHORT – regenerate with ≥1600 words -->";
  if (!md.includes("## High-Impact"))
    md = md.replace(
      "## Recommended Stack",
      "## High-Impact “Bang-for-Buck” Additions\n\n" +
        "| Rank | Supplement | Why it matters |\n|---|---|---|\n" +
        Array.from({ length: 10 })
          .map((_, i) => `| ${i + 1} | Placeholder | TBD |`)
          .join("\n") +
        "\n\n## Recommended Stack"
    );
  return md;
}

/* -------------- main export -------------- */
export async function generateStackForSubmission(id: string) {
  if (!id) throw new Error("submissionId is required");
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY missing");

  const sub = await getSubmissionWithChildren(id);

  /* lazy-load OpenAI */
  const { default: OpenAI } = await import("openai");
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const chat = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL ?? "gpt-4o",
    temperature: 0.7,
    max_tokens: 4096,
    messages: [
      { role: "system" as const, content: systemPrompt() },
      { role: "user"   as const, content: userPrompt(sub) }
    ],
  });

  const raw = chat.choices[0]?.message?.content ?? "";
  const markdown = enforce(raw || "");

  return { markdown, raw: chat };
}

export default generateStackForSubmission;
