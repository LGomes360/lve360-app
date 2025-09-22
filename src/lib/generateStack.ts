// src/lib/generateStack.ts
// -----------------------------------------------------------------------------
// LVE360 — Generate personalized supplement & lifestyle plan
// Enhanced with evidence citations, ≥10 Blueprint Recommendations,
// bullets + narrative, and DSHEA-compliant disclaimers.
// -----------------------------------------------------------------------------

import getSubmissionWithChildren from "@/lib/getSubmissionWithChildren";
import type { SubmissionWithChildren } from "@/lib/getSubmissionWithChildren";

const MAX_PROMPT_CHARS = 28000;

function safeStringify(obj: any) {
  try {
    return JSON.stringify(obj, null, 2);
  } catch {
    return String(obj);
  }
}

function calculateAge(dob: string | null): number | null {
  if (!dob) return null;
  const birthDate = new Date(dob);
  if (isNaN(birthDate.getTime())) return null;
  const today = new Date("2025-09-21"); // locked for consistency
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
    "# LVE360 Concierge Report Request",

    "You are a **wellness concierge AI**. Generate a Markdown report that is " +
      "friendly yet authoritative, like a nutritionist or physician coaching a client.",

    "## Structure — Sections (strict order, each required)",
    [
      "1. ## Summary",
      "2. ## Goals",
      "3. ## Contraindications & Med Interactions",
      "4. ## Current Stack",
      "5. ## Your Blueprint Recommendations",
      "6. ## Recommended Stack",
      "7. ## Dosing & Notes",
      "8. ## Evidence & References",
      "9. ## Shopping Links",
      "10. ## Follow-up Plan",
      "11. ## Lifestyle Prescriptions",
      "12. ## Longevity Levers",
      "13. ## This Week Try",
      "14. ## END",
    ].join("\n"),

    "",
    "## Formatting & Content Rules",
    "- Each section starts with a level-2 heading (##).",
    "- **Summary**: include demographics (Name, DOB, Age—trust `age` field, not recalculated), Weight, Height, Sex, Email.",
    "- **Contraindications & Med Interactions**: Markdown table with columns Medication | Concern | Guardrail. Must reference user’s meds directly.",
    "- **Your Blueprint Recommendations**: Markdown table with ≥10 ranked items. Columns: Rank | Supplement | Why it matters. Provide narrative context + at least one citation per item.",
    "- **Recommended Stack**: Include ALL Blueprint items (mark them clearly) plus other supplements. Table format: Supplement | Dose | Timing | Notes. Provide both bullets and explanatory narrative.",
    "- **Dosing & Notes**: cover meds + hormones with timing/notes, clarifying how they integrate with the stack.",
    "- **Evidence & References**: every supplement must have ≥1 citation (prefer PubMed, SR/MA, or RCT). Format inline citations as 【source†lines】.",
    "- **Shopping Links**: placeholder URL or [Link unavailable] if none provided.",
    "- **Follow-up Plan**: concrete cadence (labs, recheck intervals).",
    "- **Lifestyle Prescriptions**: subsections Nutrition, Sleep, Exercise, Focus, Monitoring. Mix bullets + short narrative.",
    "- **Longevity Levers**: 3–4 concise habits tied to lifespan/healthspan.",
    "- **This Week Try**: exactly 1 practical 7-day experiment.",
    "- **END sentinel**: must end with a line `## END`.",

    "",
    "## Style & Compliance",
    "- Tone: supportive coach, plain English, motivational but evidence-first.",
    "- Blend narrative (3–5 sentence paragraphs) with bulleted or numbered lists.",
    "- Use second person ('you').",
    "- Avoid medical jargon; no unverified claims. DSHEA/FTC compliant: use phrasing like 'may help', not 'will cure'.",
    "- Highlight why each rec matters, linking to user’s goals and context.",
    "- Incorporate affiliate mention subtly (e.g., 'we can provide vetted links').",

    "",
    "## Submission Data (JSON)",
    "```json",
    safeStringify({
      submission: {
        id: sub.id,
        name: (sub as any).name ?? null,
        sex: (sub as any).sex ?? null,
        dob: (sub as any).dob ?? null,
        age,
        weight: (sub as any).weight ?? null,
        height: (sub as any).height ?? null,
        goals: (sub as any).goals ?? null,
        answers: (sub as any).answers ?? null,
        email: (sub as any).user_email ?? null,
      },
      medications: sub.medications ?? [],
      supplements: sub.supplements ?? [],
      hormones: sub.hormones ?? [],
      allergies: (sub as any).allergies ?? null,
      lifestyle: {
        sleep_rating: (sub as any).sleep_rating ?? null,
        energy_rating: (sub as any).energy_rating ?? null,
        skip_meals: (sub as any).skip_meals ?? null,
      },
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

  const submission = await getSubmissionWithChildren(submissionId);
  const prompt = buildPrompt(submission);

  // init OpenAI client
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

  const response = await openai.responses.create({
    model: process.env.OPENAI_MODEL ?? "gpt-4o",
    input: prompt,
  });

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

  // enforce sentinel
  if (!markdown.includes("## END")) {
    markdown += "\n\n## END\n";
  }

  // enforce ≥10 recs placeholder if missing
  if (!markdown.includes("## Your Blueprint Recommendations")) {
    markdown =
      markdown +
      "\n\n## Your Blueprint Recommendations\n\n" +
      "| Rank | Supplement | Why it matters |\n" +
      "|------|------------|----------------|\n" +
      Array.from({ length: 10 })
        .map(
          (_, i) =>
            `| ${i + 1} | Placeholder ${i + 1} | Not generated, please retry |`
        )
        .join("\n") +
      "\n";
  }

  if (!markdown || markdown.trim().length === 0) {
    markdown = `## Report Unavailable

Sorry — our AI assistant couldn’t generate your report this time.  
Please [contact support](https://lve360.com/helpdesk) and share your submission ID.

## END`;
  }

  return { markdown, raw: response };
}

export default generateStackForSubmission;
