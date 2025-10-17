// src/lib/generateStack.ts
// -----------------------------------------------------------------------------
// Purpose: Generate a user's supplement stack from a submission in Supabase,
// apply safety hints, enrich affiliate links, and persist stack + items.
// Supports tier-aware generation: Free vs Premium (cap via options.maxItems).
// Returns a stable shape consumed by /api/generate-stack (A1).
// -----------------------------------------------------------------------------

import { supabaseAdmin } from "@/lib/supabase";

// ---------- Types ------------------------------------------------------------

export type GenerateMode = "free" | "premium";
export interface GenerateOptions {
  mode?: GenerateMode;
  maxItems?: number; // e.g., 3 for free
}

type Json = Record<string, any>;

interface SubmissionRow {
  id: string;
  user_id: string | null;
  user_email: string | null;
  goals?: string | null;
  conditions?: string[] | null;
  medications?: string[] | null;
  supplements?: string[] | null;
  hormones?: string[] | null;
  pregnant?: boolean | null;
  sex?: string | null;
  sleep_rating?: number | null;
  energy_rating?: number | null;
  dosing_pref?: string | null;
  brand_pref?: string | null;
  [k: string]: any;
}

export interface StackItem {
  name: string;
  dose?: string;
  timing?: string;
  rationale?: string;
  citations?: string[]; // URLs or PMIDs
  notes?: string;
  order_index?: number;
  // Affiliate links (enriched)
  amazon_url?: string | null;
  fullscript_url?: string | null;
  // Safety
  safety_flag?: "safe" | "warning" | "avoid";
  safety_notes?: string[];
}

interface GeneratedResult {
  stack_id: string;
  items: StackItem[];
  safety_status: "safe" | "warning" | "error";
  safety_warnings: string[];
}

// ---------- Small utilities --------------------------------------------------

const asArray = <T>(v: T[] | null | undefined): T[] => (Array.isArray(v) ? v : []);
const nonEmpty = (s?: string | null) => (s && s.trim().length ? s.trim() : "");
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const uniq = <T>(arr: T[]) => Array.from(new Set(arr));

function mkAmazonLink(query: string): string {
  // Add your affiliate tag e.g., &tag=lve360-20
  const q = encodeURIComponent(query);
  return `https://www.amazon.com/s?k=${q}`;
}

function mkFullscriptLink(query: string): string {
  // Replace with your Fullscript collection deeplink when available
  const q = encodeURIComponent(query);
  return `https://us.fullscript.com/search?query=${q}`;
}

function toMarkdown(sub: SubmissionRow, items: StackItem[], status: string, warnings: string[]): string {
  const lines: string[] = [];
  lines.push(`# LVE360 Personalized Blueprint`);
  if (sub.user_email) lines.push(`**Email:** ${sub.user_email}`);
  if (sub.goals) lines.push(`**Goals:** ${sub.goals}`);
  lines.push(`**Safety:** ${status.toUpperCase()}`);
  if (warnings.length) {
    lines.push(`**Warnings:**`);
    for (const w of warnings) lines.push(`- ${w}`);
  }
  lines.push(``);
  lines.push(`## Your Stack`);
  items.forEach((it, idx) => {
    const n = idx + 1;
    lines.push(`### ${n}. ${it.name}${it.dose ? ` — ${it.dose}` : ""}`);
    if (it.timing) lines.push(`- **Timing:** ${it.timing}`);
    if (it.rationale) lines.push(`- **Why:** ${it.rationale}`);
    if (it.amazon_url) lines.push(`- **Amazon:** ${it.amazon_url}`);
    if (it.fullscript_url) lines.push(`- **Fullscript:** ${it.fullscript_url}`);
    if (it.citations && it.citations.length) {
      lines.push(`- **Citations:**`);
      for (const c of it.citations) lines.push(`  - ${c}`);
    }
    if (it.safety_flag && it.safety_flag !== "safe") {
      lines.push(`- **Safety:** ${it.safety_flag.toUpperCase()}`);
    }
    if (it.notes) lines.push(`- **Notes:** ${it.notes}`);
    lines.push("");
  });
  return lines.join("\n");
}

// ---------- DB: read submission ---------------------------------------------

async function getSubmission(submissionId: string): Promise<SubmissionRow> {
  const { data, error } = await supabaseAdmin
    .from("submissions")
    .select(
      [
        "id",
        "user_id",
        "user_email",
        "goals",
        "conditions",
        "medications",
        "supplements",
        "hormones",
        "pregnant",
        "sex",
        "sleep_rating",
        "energy_rating",
        "dosing_pref",
        "brand_pref",
      ].join(",")
    )
    .eq("id", submissionId)
    .maybeSingle();

  if (error) throw new Error(`DB error loading submission: ${error.message}`);
  if (!data) throw new Error(`Submission ${submissionId} not found`);
  return data as SubmissionRow;
}

// ---------- Deterministic generation (LLM-optional) --------------------------

function seedByGoals(sub: SubmissionRow): StackItem[] {
  // Simple, predictable seeds by common goals.
  const base: Record<string, StackItem[]> = {
    weight: [
      { name: "Creatine Monohydrate", dose: "3–5 g/day", timing: "Anytime", rationale: "Supports lean mass and performance" },
      { name: "Fish Oil (EPA+DHA)", dose: "1–2 g/day", timing: "With meals", rationale: "Cardiometabolic support" },
      { name: "Electrolytes (No Sugar)", dose: "As directed", timing: "During exercise", rationale: "Hydration & energy" },
      { name: "Green Tea Extract", dose: "250–500 mg", timing: "AM", rationale: "Metabolic support" },
    ],
    cognition: [
      { name: "Omega-3 (EPA+DHA)", dose: "1–2 g/day", timing: "With meals", rationale: "Cognitive support" },
      { name: "Magnesium Glycinate", dose: "200–400 mg", timing: "Evening", rationale: "Sleep & relaxation" },
      { name: "L-Theanine", dose: "100–200 mg", timing: "With caffeine", rationale: "Smooth focus" },
      { name: "Citicoline (CDP-Choline)", dose: "250–500 mg", timing: "AM", rationale: "Attention & memory" },
    ],
    energy: [
      { name: "Rhodiola Rosea", dose: "200–400 mg", timing: "AM", rationale: "Fatigue resistance" },
      { name: "CoQ10", dose: "100–200 mg", timing: "With meals", rationale: "Mitochondrial support" },
      { name: "Vitamin D3 + K2", dose: "2000 IU + 100 mcg", timing: "With meals", rationale: "General vitality" },
      { name: "B-Complex", dose: "Per label", timing: "With meals", rationale: "Energy metabolism" },
    ],
    longevity: [
      { name: "Vitamin D3 + K2", dose: "2000 IU + 100 mcg", timing: "With meals", rationale: "Healthy aging" },
      { name: "Magnesium Glycinate", dose: "200–400 mg", timing: "Evening", rationale: "Sleep & recovery" },
      { name: "Creatine Monohydrate", dose: "3–5 g/day", timing: "Anytime", rationale: "Healthy aging & strength" },
      { name: "Omega-3 (EPA+DHA)", dose: "1–2 g/day", timing: "With meals", rationale: "Cardio/brain support" },
    ],
  };

  const g = nonEmpty(sub.goals)?.toLowerCase() || "";
  const list =
    g.includes("cogn") || g.includes("brain") ? base.cognition
    : g.includes("weight") || g.includes("fat") ? base.weight
    : g.includes("energy") ? base.energy
    : base.longevity;

  // Light personalization via prefs
  const brand = nonEmpty(sub.brand_pref);
  const dosing = nonEmpty(sub.dosing_pref);

  return list.map((x, i) => {
    const notes: string[] = [];
    if (brand) notes.push(`Prefers brand: ${brand}`);
    if (dosing) notes.push(`Dosing pref: ${dosing}`);
    return { ...x, order_index: i, notes: notes.length ? notes.join(" • ") : undefined };
  });
}

async function llmGenerateItemsIfAvailable(sub: SubmissionRow): Promise<StackItem[] | null> {
  // Hook point: if you want to call OpenAI, do it here; otherwise return null to use deterministic seeds.
  // Keep non-throwing.
  if (!process.env.OPENAI_API_KEY) return null;
  try {
    // Placeholder: integrate your LLM prompt here later.
    return null;
  } catch {
    return null;
  }
}

async function generateItems(sub: SubmissionRow, _mode: GenerateMode): Promise<StackItem[]> {
  // Try LLM first (if configured), else deterministic seeds.
  const llm = await llmGenerateItemsIfAvailable(sub);
  const base = llm && llm.length ? llm : seedByGoals(sub);
  return asArray(base);
}

// ---------- Safety pass (best-effort, non-fatal) -----------------------------

async function safetyPass(items: StackItem[], sub: SubmissionRow): Promise<{ status: GeneratedResult["safety_status"]; warnings: string[]; items: StackItem[]; }> {
  const warnings: string[] = [];
  const safeItems: StackItem[] = asArray(items).map((it) => ({
    ...it,
    safety_flag: "safe" as const,
    safety_notes: [],
  }));

  // Pregnancy caution
  if (sub.pregnant) {
    warnings.push("Pregnancy flag: review all supplements with a clinician.");
    for (const it of safeItems) {
      it.safety_flag = (it.safety_flag === "avoid" ? "avoid" : "warning");
      (it.safety_notes ?? []).push("Pregnancy: verify safety/label dosing.");
    }
  }

  // DB-backed interactions (best-effort; ignore errors)
  try {
    for (const it of safeItems) {
      const name = nonEmpty(it.name).toLowerCase();
      if (!name) continue;

      const { data, error } = await supabaseAdmin
        .from("interactions")
        .select("ingredient, binds_thyroid_meds, sep_hours_thyroid, anticoagulants_bleeding_risk, notes")
        .ilike("ingredient", name)
        .limit(1);

      if (error) continue;
      const row = data && data[0];
      if (!row) continue;

      if (row.binds_thyroid_meds) {
        it.safety_flag = it.safety_flag === "avoid" ? "avoid" : "warning";
        (it.safety_notes ?? []).push(`Separate from thyroid meds by ${row.sep_hours_thyroid ?? 4}+ hours.`);
        warnings.push(`${it.name}: separate from thyroid meds.`);
      }
      if (row.anticoagulants_bleeding_risk) {
        it.safety_flag = "warning";
        (it.safety_notes ?? []).push("Potential bleeding risk with anticoagulants—consult clinician.");
        warnings.push(`${it.name}: potential bleeding risk with anticoagulants.`);
      }
      if (row.notes) (it.safety_notes ?? []).push(row.notes);
    }
  } catch {
    // swallow lookup failure
  }

  const hasAvoid = safeItems.some((i) => i.safety_flag === "avoid");
  const hasWarn = safeItems.some((i) => i.safety_flag === "warning");
  const status: GeneratedResult["safety_status"] = hasAvoid ? "error" : hasWarn ? "warning" : "safe";

  return { status, warnings: uniq(warnings), items: safeItems };
}

// ---------- Affiliate link enrichment ---------------------------------------

function enrichAffiliateLinks(items: StackItem[]): StackItem[] {
  return asArray(items).map((it) => {
    const q = [it.name, it.dose, it.timing].filter(Boolean).join(" ");
    return {
      ...it,
      amazon_url: mkAmazonLink(q),
      fullscript_url: mkFullscriptLink(it.name),
    };
  });
}

// ---------- Persist stack + items -------------------------------------------

async function upsertStack(
  sub: SubmissionRow,
  items: StackItem[],
  safety: { status: GeneratedResult["safety_status"]; warnings: string[] }
): Promise<GeneratedResult> {
  const normalized = asArray(items).map((it, idx) => ({
    ...it,
    order_index: typeof it.order_index === "number" ? it.order_index : idx,
    citations: asArray(it.citations),
    safety_notes: asArray(it.safety_notes),
  }));

  // 1) Upsert stacks (unique per submission_id)
  let stackId: string | null = null;

  const { data: existing } = await supabaseAdmin
    .from("stacks")
    .select("id")
    .eq("submission_id", sub.id)
    .maybeSingle();

  if (existing?.id) {
    stackId = existing.id;
    const { error: updErr } = await supabaseAdmin
      .from("stacks")
      .update({
        user_id: sub.user_id,
        items: normalized as unknown as Json[],
        safety_status: safety.status,
        safety_warnings: safety.warnings,
      })
      .eq("id", stackId);
    if (updErr) throw new Error(`DB error updating stack: ${updErr.message}`);
  } else {
    const { data: ins, error: insErr } = await supabaseAdmin
      .from("stacks")
      .insert({
        submission_id: sub.id,
        user_id: sub.user_id,
        items: normalized as unknown as Json[],
        safety_status: safety.status,
        safety_warnings: safety.warnings,
      })
      .select("id")
      .maybeSingle();
    if (insErr) throw new Error(`DB error inserting stack: ${insErr.message}`);
    stackId = ins?.id ?? null;
  }

  if (!stackId) throw new Error(`Failed to resolve stack id for submission ${sub.id}`);

  // 2) Best-effort sync stacks_items (schema may vary — do not throw on error)
  try {
    await supabaseAdmin.from("stacks_items").delete().eq("stack_id", stackId);
    const rows = normalized.map((it) => ({
      stack_id: stackId,
      user_id: sub.user_id,
      submission_id: sub.id,
      name: it.name,
      dose: it.dose ?? null,
      timing: it.timing ?? null,
      rationale: it.rationale ?? null,
      citations: (it.citations ?? []) as unknown as Json[],
      amazon_url: it.amazon_url ?? null,
      fullscript_url: it.fullscript_url ?? null,
      safety_flag: it.safety_flag ?? "safe",
      notes: it.notes ?? null,
      order_index: typeof it.order_index === "number" ? it.order_index : 0,
    }));
    if (rows.length) await supabaseAdmin.from("stacks_items").insert(rows);
  } catch (e) {
    console.warn("[generateStack] stacks_items insert skipped:", e);
  }

  return {
    stack_id: stackId,
    items: normalized,
    safety_status: safety.status,
    safety_warnings: safety.warnings,
  };
}

// ---------- Main exported function ------------------------------------------

export async function generateStackForSubmission(
  submissionId: string,
  options?: GenerateOptions
): Promise<{ markdown: string; raw: GeneratedResult }> {
  const mode: GenerateMode = options?.mode === "premium" ? "premium" : "free";
  const capDefault = mode === "free" ? 3 : 12;
  const cap = typeof options?.maxItems === "number" ? clamp(options.maxItems, 1, 20) : capDefault;

  // 1) Load submission
  const sub = await getSubmission(submissionId);

  // 2) Generate items
  const genItems = await generateItems(sub, mode);

  // 3) Cap for free mode
  const capped = asArray(genItems).slice(0, cap);

  // 4) Enrich affiliate links
  const enriched = enrichAffiliateLinks(capped);

  // 5) Apply safety pass
  const { status, warnings, items: safeItems } = await safetyPass(enriched, sub);

  // 6) Persist stack + items
  const persisted = await upsertStack(sub, safeItems, { status, warnings });

  // 7) Markdown for Results/PDF
  const md = toMarkdown(sub, persisted.items, persisted.safety_status, persisted.safety_warnings);

  return { markdown: md, raw: persisted };
}
