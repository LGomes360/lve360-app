// src/lib/generateStack.ts
// Generate a supplement "stack" report (Markdown with 13 strict sections)
// for a submission using OpenAI.
//
// - Lazy-inits OpenAI client at runtime to avoid build-time errors.
// - Uses getSubmissionWithChildren to load submission + child rows.
// - Saves output in stacks.sections.markdown via /api/generate-stack.
//
// Contract: ALWAYS 13 sections in this exact order.
//   ## Summary
//   ## Goals
//   ## Contraindications & Med Interactions
//   ## Current Stack
//   ## Recommended Stack
//   ## Dosing & Notes
//   ## Evidence & References
//   ## Shopping Links
//   ## Follow-up Plan
//   ## Lifestyle Prescriptions
//   ## Longevity Levers
//   ## This Week Try
//   ## Self-Tracking Dashboard

import getSubmissionWithChildren from "@/lib/getSubmissionWithChildren";
import type { SubmissionWithChildren } from "@/lib/getSubmissionWithChildren";

const MAX_PROMPT_CHARS = 28_000;

function safeStringify(obj: any) {
  try {
    return JSON.stringify(obj, null, 2);
  } catch {
    return String(obj);
  }
}

function buildPrompt(sub: SubmissionWithChildren) {
  const parts = [
    "# LVE360 Personalized Stack Report Request",

    "Please generate a Markdown report with **exactly 13 sections**. " +
      "Each section must appear, even if content is minimal. " +
      "Use the submission JSON below as the only source of truth. " +
      "If information is missing, explicitly state that. Do not hallucinate data.",

    "## Output Format (Markdown, strict headers)",
    "Each section must start with a level-2 heading (##). " +
      "The sections, in order, are:",

    [
      "1. ## Summary",
      "2. ## Goals",
      "3. ## Contraindications & Med Interactions",
      "4. ## Current Stack",
      "5. ## Recommended Stack",
      "6. ## Dosing & Notes",
      "7. ## Evidence & References",
      "8. ## Shopping Links",
      "9. ## Follow-up Plan",
      "10. ## Lifestyle Prescriptions",
      "11. ## Longevity Levers",
      "12. ## This Week Try",
      "13. ## Self-Tracking Dashboard",
    ].join("\n"),

    "",
    "Important formatting rules:",
    "- Return **Markdown only** in the response body.",
    "- ASCII-safe characters only; wrap lines at ~80 chars.",
    "- Each section must have at least 1–2 sentences or a table/list.",
    "- In 'Recommended Stack', output a Markdown table with columns: " +
      "`Supplement | Dose | Timing | Notes`.",
    "- In 'Self-Tracking Dashboard', output a Markdown table with columns: " +
      "`Date | Energy (1-10) | Sleep (1-10) | Weight | Notes` with 3 sample rows.",

    "",
    "Submission (JSON):",
    "```json",
    safeStringify({
      submission: {
        id: sub.id,
        name: (sub as any).name ?? null,
        sex: (sub as any).sex ?? null,
        dob: (sub as any).dob ?? null,
        weight: (sub as any).weight ?? null,
        height: (sub as any).height ?? null,
        goals: (sub as any).goals ?? null,
        answers: (sub as any).answers ?? null,
      },
      medications: sub.medications ?? [],
      supplements: sub.supplements ?? [],
      hormones: sub.hormones ?? [],
    }),
    "```",

    "",
    "End of instructions.",
  ];

  let prompt = parts.join("\n\n");
  if (prompt.length > MAX_PROMPT_CHARS) {
    prompt =
      prompt.slice(0, MAX_PROMPT_CHARS - 500) + "\n\n...TRUNCATED_FOR_LENGTH";
  }
  return prompt;
}

export async function generateStackForSubmission(submissionId: string) {
  if (!submissionId) throw new Error("submissionId is required");
  if (!process.env.OPENAI_API_KEY)
    throw new Error("OPENAI_API_KEY is not configured");

  // 1) Load submission + children
  const submission = await getSubmissionWithChildren(submissionId);

  // 2) Build prompt
  const prompt = buildPrompt(submission);

  // 3) Lazy-init OpenAI client at runtime
  let openai: any = null;
  try {
    const localMod: any = await import("./openai").catch(() => null);
    if (localMod) {
      if (typeof localMod.getOpenAiClient === "function") {
        openai = localMod.getOpenAiClient();
      } else if (typeof localMod.getOpenAI === "function") {
        openai = localMod.getOpenAI();
      } else if (localMod.default) {
        const Def = localMod.default;
        openai =
          typeof Def === "function"
            ? new Def({ apiKey: process.env.OPENAI_API_KEY })
            : Def;
      }
    }
    if (!openai) {
      const OpenAIMod: any = await import("openai");
      const OpenAIDef = OpenAIMod?.default ?? OpenAIMod;
      openai =
        typeof OpenAIDef === "function"
          ? new OpenAIDef({ apiKey: process.env.OPENAI_API_KEY })
          : OpenAIDef;
    }
    if (!openai) throw new Error("OpenAI initialization failed");
  } catch (e: any) {
    throw new Error(`OpenAI init failed: ${String(e?.message ?? e)}`);
  }

  // 4) Call OpenAI
  const response = await openai.responses.create({
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    input: prompt,
  });

  // 5) Extract Markdown
  let markdown = "";
  try {
    const outputs = (response as any).output;
    if (Array.isArray(outputs) && outputs.length) {
      const first = outputs[0];
      if (typeof first === "string") markdown = first;
      else if (first?.content) {
        if (Array.isArray(first.content)) {
          markdown = first.content
            .map((c: any) => c.text ?? c.parts?.join?.("") ?? "")
            .join("\n");
        } else if (typeof first.content === "string") {
          markdown = first.content;
        } else if (first.content?.[0]?.text) {
          markdown = first.content.map((c: any) => c.text).join("\n");
        }
      }
    } else if ((response as any).output_text) {
      markdown = (response as any).output_text;
    } else {
      markdown = safeStringify(response);
    }
  } catch {
    markdown = safeStringify(response);
  }

  // 6) Fallback
  if (!markdown || markdown.trim().length === 0) {
    markdown = `## Report Unavailable

Sorry — our AI assistant couldn’t generate your report this time.  
Please [contact support](https://lve360.com/helpdesk) and share your submission ID.`;
  }

  return { markdown, raw: response };
}

export default generateStackForSubmission;
