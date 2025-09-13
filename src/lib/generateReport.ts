// src/lib/generateReport.ts

import OpenAI from "openai";
import { z } from "zod";
import { supabaseAdmin } from "./supabase";
import { getSubmissionWithChildren } from "./getSubmissionWithChildren";

// -------------------
// Types & Schema
// -------------------

const ReportInputSchema = z.object({
  id: z.string().optional(),
  email: z.string().email().optional(),
  goals: z.array(z.string()).default([]),
  healthConditions: z.array(z.string()).default([]),
  medications: z.array(z.string()).default([]),
  supplements: z.array(z.string()).default([]),
  hormones: z.array(z.string()).default([]),
  tier: z.enum(["budget", "mid", "premium"]).optional(),
  dob: z.string().optional(),
  sex: z.string().optional(),
  pregnant: z.string().optional(),
  weight: z.number().optional(),
  height: z.string().optional(),
  energy_rating: z.number().optional(),
  sleep_rating: z.number().optional(),
  dosing_pref: z.string().optional(),
  brand_pref: z.string().optional(),
});

export type ReportInput = z.infer<typeof ReportInputSchema>;

// -------------------
// OpenAI Setup
// -------------------

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

// -------------------
// Main Function
// -------------------

export async function generateReport(submissionIdOrEmail: string) {
  // 1) Load normalized submission with child tables
  const submission = await getSubmissionWithChildren(submissionIdOrEmail);
  const parsed = ReportInputSchema.parse(normalizeSubmission(submission));

  // 2) Build report prompt from spec
  const prompt = buildReportPromptFromSpec(parsed, "detailed");

  // 3) Call LLM
  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    temperature: 0.4,
    messages: [
      {
        role: "system",
        content:
          "You are LVE360, a wellness concierge. You must be DSHEA/FTC compliant, avoid disease claims, avoid diagnosing, and use cautious language like 'research suggests' and 'many people find'.",
      },
      { role: "user", content: prompt },
    ],
  });

  const body = completion.choices[0].message?.content?.trim() || "";

  // 4) Persist to DB
  const { data: reportRow, error } = await supabaseAdmin
    .from("reports")
    .insert({
      submission_id: submission?.id ?? null,
      body,
      generated_by: "llm",
      created_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    console.error("❌ Failed to save report:", error);
    return { body, saved: false };
  }

  return { body, saved: true, id: reportRow.id };
}

// -------------------
// Helpers
// -------------------

function normalizeSubmission(sub: any): ReportInput {
  const meds = arrToNames(sub?.medications);
  const supps = arrToNames(sub?.supplements);
  const horms = arrToNames(sub?.hormones);

  return {
    id: sub?.id,
    email: sub?.user_email ?? sub?.email,
    goals: sub?.goals ?? [],
    healthConditions: sub?.healthConditions ?? sub?.conditions ?? [],
    medications: meds,
    supplements: supps,
    hormones: horms,
    tier: sub?.tier ?? "budget",
    dob: sub?.dob,
    sex: sub?.sex ?? sub?.sex_at_birth,
    pregnant: sub?.pregnant,
    weight: numOrUndefined(sub?.weight),
    height: sub?.height,
    energy_rating: numOrUndefined(sub?.energy_rating),
    sleep_rating: numOrUndefined(sub?.sleep_rating),
    dosing_pref: sub?.dosing_pref,
    brand_pref: sub?.brand_pref,
  };
}

function arrToNames(a: any): string[] {
  if (!a) return [];
  if (Array.isArray(a)) {
    return a.map((x) => (typeof x === "string" ? x : x?.name)).filter(Boolean);
  }
  return [];
}

function numOrUndefined(x: any) {
  const n = Number(x);
  return Number.isFinite(n) ? n : undefined;
}

// -------------------
// Prompt Builder
// -------------------

export function buildReportPromptFromSpec(
  s: ReportInput,
  mode: "detailed" | "busy" = "detailed"
) {
  const styleHint =
    mode === "busy"
      ? "Keep sections concise, use bullet points, scannable formatting, no long paragraphs."
      : "Provide fuller context with short paragraphs where helpful.";

  return `
# LVE360 Concierge Report (User: ${s.email ?? "n/a"})

SYSTEM & BOUNDARIES
- You are a wellness concierge for LVE360.
- Be DSHEA/FTC compliant: no disease claims, no diagnosis, no guaranteed outcomes.
- Always use cautious phrases like “research suggests”, “may help”, “many people find”.
- Every supplement or lifestyle suggestion must include a plain-English “why it matters”.
- ${styleHint}

---
## Section 1. Current Analysis
Summarize the user’s situation:
- Age: ${ageFromDOB(s.dob) ?? "unknown"}
- Sex at Birth: ${s.sex ?? "unknown"}
- Pregnant: ${s.pregnant ?? "unknown"}
- Height/Weight: ${s.height ?? "?"} / ${s.weight ?? "?"}
- Energy (1–5): ${s.energy_rating ?? "?"}
- Sleep (1–5): ${s.sleep_rating ?? "?"}
- Goals: ${s.goals.join(", ") || "None provided"}
- Conditions: ${s.healthConditions.join(", ") || "None reported"}
- Current meds: ${s.medications.join(", ") || "None listed"}
- Current supplements: ${s.supplements.join(", ") || "None listed"}
- Hormones: ${s.hormones.join(", ") || "None listed"}
- Preferences: dosing=${s.dosing_pref ?? "n/a"}, brand=${s.brand_pref ?? "n/a"}
- Tier: ${s.tier ?? "budget"}

---
## Section 2. Contraindications
List any red flags from medications, conditions, pregnancy, or allergies that might influence supplement choices.
Use cautious wording (e.g. “be mindful of…”).

---
## Section 3. Bang-for-Buck
Highlight the 2–3 most cost-effective, impactful supplements or habits aligned with the user’s goals and tier (budget/mid/premium).

---
## Section 4. Personalized Stack
- Build up to 6 supplements across AM / PM / Night.
- For each: name, dose, timing, rationale (1–2 sentences), and at least one systematic review or meta-analysis citation.
- Respect tier preference.
- Never exceed 100% of the Tolerable Upper Limit.
- Avoid known interactions and pregnancy risks.

---
## Section 5. Lifestyle Advice
Give 3–5 practical habits (sleep hygiene, meals, hydration, activity).
Keep advice realistic, easy to implement, and aligned with user goals.

---
## Section 6. Longevity Notes
Offer 2–3 evidence-based practices or supplements tied to longevity and healthy aging, framed cautiously (e.g., “research suggests”).
If uncertain, emphasize safe and conservative options.

---
## Section 7. This Week, Try
Suggest one low-effort, high-impact habit or micro-change the user can try this week.

---
## Section 8. Dashboard Snapshot
Recommend 3–5 metrics the user can easily track (e.g., AM energy 1–10, bedtime latency, daily steps, protein grams).
Format as a simple markdown table.

---
## Section 9. Disclaimers
End with a DSHEA-compliant disclaimer:
“This information is for educational purposes only, is not medical advice, and is not intended to diagnose, treat, cure, or prevent any disease. Always consult a qualified healthcare provider before starting new supplements or making major lifestyle changes.”

---
OUTPUT INSTRUCTIONS
- Return the full report as clean markdown, following the headings above.
- Use friendly but professional tone.
- Include citations inline where relevant.
`;
}

// -------------------
// Utilities
// -------------------

function ageFromDOB(dob?: string) {
  if (!dob) return undefined;
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return undefined;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return age;
}
