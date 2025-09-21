// src/lib/generateStack.ts
// -----------------------------------------------------------------------------
// Generate a supplement "stack" report (Markdown with 13 strict sections)
// for a submission using OpenAI.
// - Uses getSubmissionWithChildren to load submission + child rows.
// - Enhances prompt to follow LVE360 "StrictWrap" style:
//   * Computes age from DOB
//   * Requires Medication & Contraindication Review table
//   * Requires Bang-for-Buck Additions (ranked)
//   * Requires Optimized vs Busy-Pro Friendly plan
//   * Expands Lifestyle Prescriptions into Nutrition / Sleep / Exercise / Focus / Monitoring
//   * Requires at least one evidence reference per supplement
//   * Requires Self-Tracking Dashboard with logical columns (no fake dates)
// - Returns { markdown, raw } where markdown is the AI output
// -----------------------------------------------------------------------------

import getSubmissionWithChildren from "@/lib/getSubmissionWithChildren";
import type { SubmissionWithChildren } from "@/lib/getSubmissionWithChildren";

const MAX_PROMPT_CHARS = 28_000;

// Utility: safe JSON.stringify
function safeStringify(obj: any) {
  try {
    return JSON.stringify(obj, null, 2);
  } catch {
    return String(obj);
  }
}

// Utility: compute age from DOB (YYYY-MM-DD string)
function calculateAge(dob: string | null): number | null {
  if (!dob) return null;
  const birthDate = new Date(dob);
  if (isNaN(birthDate.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}

function buildPrompt(sub: SubmissionWithChildren) {
  const age = calculateAge((sub as any).dob ?? null);

  const parts = [
    "# LVE360 Strict Report Request",

    "Please generate a Markdown report with **exactly 13 sections**, in the order listed below. " +
      "Do not omit any section, even if minimal. Use the provided submission JSON as the only source of truth. " +
      "If information is missing, explicitly state it. Do not hallucinate.",

    "## Sections (strict order)",
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
    "## Formatting & Content Rules",
    "- Each section must start with a level-2 heading (##).",
    "- In **Summary**, include: Name, Sex, Date of Birth, computed Age (use provided DOB), Height, Weight, Email.",
    "- In **Contraindications & Med Interactions**, include a **table** with columns: Medication | Concern | Guardrail.",
    "- In **Recommended Stack**, include a **Markdown table** with columns: Supplement | Dose | Timing | Notes.",
    "- In **Dosing & Notes**, include medications + hormones with timing/notes.",
    "- In **Evidence & References**, provide at least one citation per supplement (PubMed link or SR/MA preferred). If evidence is limited, state 'Evidence limited'.",
    "- In **Shopping Links**, include placeholder URLs or '[Link unavailable]' for each item unless actual links are provided.",
    "- In **Follow-up Plan**, include concrete cadence (e.g., labs every 6–12 months, recheck after 8–12 weeks).",
    "- In **Lifestyle Prescriptions**, break down into Nutrition, Sleep, Exercise, Focus, Monitoring subsections with bullet points.",
    "- In **Longevity Levers**, give 3–4 concise habits that improve lifespan/healthspan.",
    "- In **This Week Try**, give exactly 1 practical experiment for the next 7 days.",
    "- In **Self-Tracking Dashboard**, create a Markdown table with columns: Metric | How to Track | Target Range. " +
      "Do not invent calendar dates. Include metrics: Energy (1–10), Sleep (1–5 stars), Steps/day, Mood, Blood Pressure, Weight.",

    "",
    "## Important Constraints",
    "- ASCII-safe characters only; wrap lines at ~80 chars.",
    "- Return Markdown only in the response body.",
    "- Do not include any private keys or environment values.",

    "",
    "## Submission Data (JSON)",
    "```json",
    safeStringify({
      submission: {
        id: sub.id,
        name: (sub as any).name ?? null,
        sex: (sub as any).sex ?? null,
        dob: (sub as any).dob ?? null,
        age: age,
        weight: (sub as any).weight ?? null,
        height: (sub as any).height ?? null,
        goals: (sub as any).goals ?? null,
        answers: (sub as any).answers ?? null,
        email: (sub as any).user_email ?? null,
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

  // 3) Lazy-init OpenAI client
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
