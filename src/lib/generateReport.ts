// src/lib/generateReport.ts
import OpenAI from "openai";
import { z } from "zod";
import { supabaseAdmin } from "./supabase"; // adjust if your client export is named differently
import { getSubmissionWithChildren } from "./getSubmissionWithChildren";

// Types
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

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export async function generateReport(submissionIdOrEmail: string) {
  // 1) Load normalized submission with child tables
  const submission = await getSubmissionWithChildren(submissionIdOrEmail);
  const parsed = ReportInputSchema.parse(normalizeSubmission(submission));

  // 2) Build report prompt from spec
  const prompt = buildReportPromptFromSpec(parsed);

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
    console.error("Failed to save report:", error);
    // still return the body so the UI can show it
    return { body, saved: false };
  }

  return { body, saved: true, id: reportRow.id };
}

// --- helpers ---

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

function buildReportPromptFromSpec(s: ReportInput) {
  // This follows your 9-section concierge spec; you can tweak headings/order as needed.
  // Keep it branded, plain English, DSHEA-safe, with “why it matters”.
  return `
# LVE360 Concierge Report (User: ${s.email ?? "n/a"})

## Boundaries & Voice
- DSHEA/FTC compliant: no disease claims, no diagnosis, no guaranteed outcomes.
- Use cautious phrases: “research suggests”, “may help”, “many people find”.
- Explain *why it matters* in plain English; be concise and empathetic.

## User Profile (Section 1)
- Age: ${ageFromDOB(s.dob) ?? "unknown"}
- Sex at birth: ${s.sex ?? "unknown"}
- Pregnant: ${s.pregnant ?? "unknown"}
- Height/Weight: ${s.height ?? "?"} / ${s.weight ?? "?"}
- Energy (1–5): ${s.energy_rating ?? "?"}
- Sleep (1–5): ${s.sleep_rating ?? "?"}

## Goals (Section 2)
- Top goals: ${s.goals.join(", ") || "None provided"}

## Current Medications & Supplements (Section 3)
- Medications: ${s.medications.join(", ") || "None listed"}
- Supplements: ${s.supplements.join(", ") || "None listed"}
- Hormones: ${s.hormones.join(", ") || "None listed"}

## Key Flags & Considerations (Section 4)
- Conditions: ${s.healthConditions.join(", ") || "None reported"}
- Dosing and brand preferences: ${s.dosing_pref ?? "n/a"} | ${s.brand_pref ?? "n/a"}
- Tier preference: ${s.tier ?? "budget"}

## Personalized Stack (Section 5)
- Build up to 6 items across AM / PM / Night.
- For each: name, dose, timing, short rationale (1–2 sentences), and at least one systematic review/meta-analysis citation.
- Avoid known interactions and pregnancy risks; never exceed 100% UL. If uncertain, choose conservative doses.

## Habits & Lifestyle Advice (Section 6)
- 3–5 practical habit suggestions aligned to goals (sleep, meals, hydration, movement).
- Keep advice realistic and low-friction.

## What to Track (Section 7)
- Suggest 3–5 simple metrics to track (e.g., morning energy 1–10, bedtime latency, steps).

## Safety Notes (Section 8)
- Gently restate DSHEA cautionary language and general safety reminders.

## References (Section 9)
- List the citations you used for the stack in standard short form.

### Output Format
Return a clean, markdown-formatted report following the headings above. Keep it scannable.`;
}

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
