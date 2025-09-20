// src/lib/generateStack.ts
// Generate a supplement "stack" (Markdown) for a submission using OpenAI.
// - Lazy-inits OpenAI at runtime to avoid throwing at build-time.
// - Uses getSubmissionWithChildren to load the submission and children.
// - Returns { markdown, raw } where raw is the OpenAI response object.

import getSubmissionWithChildren from "@/lib/getSubmissionWithChildren";
import type { SubmissionWithChildren } from "@/lib/getSubmissionWithChildren";

const MAX_PROMPT_CHARS = 28_000; // keep prompt comfortably under model input limits

function safeStringify(obj: any) {
  try {
    return JSON.stringify(obj, null, 2);
  } catch {
    return String(obj);
  }
}

function buildPrompt(sub: SubmissionWithChildren) {
  const parts = [
    "# LVE360 Stack Generation Request",
    "Please return a single Markdown-formatted supplement stack with exactly 9 sections. Sections should be labeled and in this order:",
    "1) Summary\n2) Goals\n3) Contraindications/Med-Interactions\n4) Current Stack\n5) Recommended Stack (AM/PM/Bedtime)\n6) Dosing & Notes\n7) Evidence & References\n8) Shopping Links\n9) Follow-up Plan",
    "",
    "Use the submission below as the ONLY source of truth. Do NOT hallucinate additional conditions or medications. If data is missing, explicitly note it.",
    "",
    "Submission (JSON):",
    "```json",
    safeStringify({
      submission: {
        id: sub.id,
        name: (sub as any).name ?? null,
        age: (sub as any).age ?? null,
        sex: (sub as any).sex ?? null,
        answers: (sub as any).answers ?? null,
      },
      medications: sub.medications ?? [],
      supplements: sub.supplements ?? [],
      hormones: sub.hormones ?? [],
    }),
    "```",
    "",
    "Important constraints:",
    "- Return Markdown only in the response body.",
    "- Use ASCII-safe characters and strict line wrapping ~80 chars max.",
    "- Do NOT include any private keys or environment values.",
    "",
    "Output rules:",
    "- Exactly 9 sections as listed above.",
    "- Each section must have a short header (like \"## Summary\") and 2-6 bullet points where appropriate.",
    "",
    "Produce the recommended stack in a table where columns are: Supplement | Dose | Timing | Notes",
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

  // 4) Call OpenAI response API
  const response = await openai.responses.create({
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    input: prompt,
  });

  // 5) Extract primary text output
  let markdown = "";
  try {
    const outputs = (response as any).output;
    if (Array.isArray(outputs) && outputs.length) {
      const first = outputs[0];
      if (typeof first === "string") markdown = first;
      else if (first?.content) {
        if (Array.isArray(first.content)) {
          markdown = first.content
            .map(
              (c: any) => c.text ?? c.parts?.join?.("") ?? ""
            )
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

  // ✅ Fallback for user-facing clarity
  if (!markdown || markdown.trim().length === 0) {
    markdown = `## Report Unavailable

Sorry — our AI assistant couldn’t generate your blueprint this time.  
Please [contact support](https://lve360.com/helpdesk) and share your submission ID so we can help.`;
  }

  return { markdown, raw: response };
}

export default generateStackForSubmission;
