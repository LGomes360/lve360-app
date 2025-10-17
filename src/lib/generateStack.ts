// src/lib/generateStack.ts
// -----------------------------------------------------------------------------
// LVE360 Stack Generator (comprehensive, TS-safe)
//
// What this file does:
// 1) Loads a normalized submission by id.
// 2) Generates a supplement stack (LLM if available -> deterministic seeds).
// 3) Enriches items with affiliate links (Amazon, Fullscript).
// 4) Runs a Safety Engine (pregnancy + DB-backed interactions).
// 5) Persists to `stacks` (single row per submission_id) and syncs `stacks_items`.
// 6) Builds a Markdown "Blueprint" and validates it; applies fallback tightening.
// 7) Returns { markdown, raw: { stack_id, items, safety_status, safety_warnings } }.
//
// Tier model:
// - options.mode: "free" | "premium"  (passed from /api route)
// - options.maxItems: optional cap (e.g., 3 for free)
//   If omitted, defaults to 3 for free, 12 for premium.
//
// Notes:
// - All DB interactions are best-effort and defensive (no `.map` on undefined).
// - If tables like `interactions` or `stacks_items` are absent or differ, we
//   swallow errors and keep `stacks.items` JSON as the source of truth.
// - This file is intentionally verbose and explicit to avoid TypeScript barking.
// -----------------------------------------------------------------------------

import { supabaseAdmin } from "@/lib/supabase";

// ---------- Types ------------------------------------------------------------

export type GenerateMode = "free" | "premium";
export interface GenerateOptions {
  mode?: GenerateMode;
  maxItems?: number;     // hard cap (e.g., 3 for Free)
  forceRegenerate?: boolean; // if true, we will overwrite even if a prior stack exists
}

type Json = Record<string, any>;

interface SubmissionRow {
  id: string;
  user_id: string | null;
  user_email: string | null;

  // Core normalized fields (best-effort; may be null/undefined on legacy rows)
  goals?: string | null;
  conditions?: string[] | null;
  medications?: string[] | null;  // array of strings or structured objects, but we treat as string names
  supplements?: string[] | null;  // current self-reported supplements
  hormones?: string[] | null;
  pregnant?: boolean | null;
  allergies?: string[] | null;
  sex?: string | null;

  // Quick ratings & prefs
  sleep_rating?: number | null;
  energy_rating?: number | null;
  dosing_pref?: string | null;
  brand_pref?: string | null;

  // Any other passthrough from webhook mapping:
  [k: string]: any;
}

export interface StackItem {
  name: string;
  dose?: string;
  timing?: string;
  rationale?: string;
  citations?: string[];      // refs/URLs/PMIDs
  notes?: string;
  order_index?: number;

  // Affiliate enrichment
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

// ---------- Utilities (pure, TS-safe) ---------------------------------------

const asArray = <T>(v: T[] | null | undefined): T[] => (Array.isArray(v) ? v : []);
const nonEmpty = (s?: string | null) => (typeof s === "string" && s.trim().length ? s.trim() : "");
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const uniq = <T>(arr: T[]) => Array.from(new Set(arr));

function safeInt(n: unknown, def = 0): number {
  const x = typeof n === "number" ? n : Number(n);
  return Number.isFinite(x) ? x : def;
}

function randomUUID(): string {
  // Avoid TS/node polyfill differences across runtimes
  try {
    // @ts-ignore
    if (globalThis && typeof globalThis.crypto?.randomUUID === "function") {
      // @ts-ignore
      return globalThis.crypto.randomUUID();
    }
  } catch {}
  // Poor-man fallback
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0; // not cryptographic
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ---------- Markdown builder & Validator ------------------------------------

function toMarkdown(
  sub: SubmissionRow,
  items: StackItem[],
  status: string,
  warnings: string[]
): string {
  const out: string[] = [];
  out.push(`# LVE360 Personalized Blueprint`);
  if (sub.user_email) out.push(`**Email:** ${sub.user_email}`);
  if (sub.goals) out.push(`**Goals:** ${sub.goals}`);
  out.push(`**Safety:** ${status.toUpperCase()}`);
  if (warnings.length) {
    out.push(`**Warnings:**`);
    for (const w of warnings) out.push(`- ${w}`);
  }
  out.push("");
  out.push(`## Your Stack`);
  asArray(items).forEach((it, idx) => {
    const title = `### ${idx + 1}. ${it.name}${it.dose ? ` — ${it.dose}` : ""}`;
    out.push(title);
    if (it.timing) out.push(`- **Timing:** ${it.timing}`);
    if (it.rationale) out.push(`- **Why:** ${it.rationale}`);
    if (it.amazon_url) out.push(`- **Amazon:** ${it.amazon_url}`);
    if (it.fullscript_url) out.push(`- **Fullscript:** ${it.fullscript_url}`);
    if (asArray(it.citations).length) {
      out.push(`- **Citations:**`);
      for (const c of asArray(it.citations)) out.push(`  - ${c}`);
    }
    if (it.safety_flag && it.safety_flag !== "safe") {
      out.push(`- **Safety:** ${it.safety_flag.toUpperCase()}`);
    }
    if (it.notes) out.push(`- **Notes:** ${it.notes}`);
    out.push("");
  });
  return out.join("\n");
}

// ---- Validator (restores your validation.debug logs) ------------------------

const MAX_WORDS = 1200;
const MIN_WORDS = 600;

function wordCount(s: string): number {
  return (s || "").trim().split(/\s+/).filter(Boolean).length;
}
function hasSection(md: string, title: string): boolean {
  const re = new RegExp(`^\\s*##\\s*${title}\\b`, "im");
  return re.test(md);
}
function validHeadings(md: string): boolean {
  const h1 = /^\s*#\s+.+/m.test(md);
  const h2 = /^\s*##\s+.+/m.test(md);
  return h1 && h2;
}
function citationsPresent(md: string): boolean {
  return /Citations:\s*$/im.test(md) || /\bhttps?:\/\/\S+/i.test(md);
}
function narrativesPresent(md: string): boolean {
  return /-\s*\*\*Why:\*\*/i.test(md);
}
function blueprintPresent(md: string): boolean {
  return hasSection(md, "Your Stack");
}
function endMarkerValid(_md: string): boolean {
  return true; // placeholder if you later adopt explicit end tokens
}

function validateMarkdownBlueprint(md: string) {
  const actualWordCount = wordCount(md);
  const wordCountOK = actualWordCount >= MIN_WORDS && actualWordCount <= MAX_WORDS;
  const headingsValid = validHeadings(md);
  const blueprintValid = blueprintPresent(md);
  const citationsValid = citationsPresent(md);
  const narrativesValid = narrativesPresent(md);
  const endValid = endMarkerValid(md);
  return {
    wordCountOK,
    headingsValid,
    blueprintValid,
    citationsValid,
    narrativesValid,
    endValid,
    actualWordCount,
  };
}

function tightenMarkdown(md: string): string {
  const words = (md || "").split(/\s+/);
  if (words.length > MAX_WORDS) {
    return words.slice(0, MAX_WORDS).join(" ") + "\n\n_Trimmed to meet length limits._";
  }
  if (words.length < MIN_WORDS) {
    return (
      md +
      `\n\n_Notes:_ This summary is intentionally concise. Future revisions will expand on dosing rationale and evidence links.`
    );
  }
  return md;
}

function minimalBlueprintFromItems(sub: SubmissionRow, items: StackItem[]): string {
  // If the primary build fails validation, we can synthesize a minimal but valid blueprint.
  const warnings: string[] = [];
  return toMarkdown(sub, items, "warning", warnings);
}

// ---------- DB: Load submission + (optional) existing stack ------------------

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
        "allergies",
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

async function getExistingStackId(submissionId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("stacks")
    .select("id")
    .eq("submission_id", submissionId)
    .maybeSingle();
  if (error) return null;
  return data?.id ?? null;
}

// ---------- Generation (LLM optional, deterministic fallback) ----------------

function baseSeedsByGoals(sub: SubmissionRow): StackItem[] {
  // Deterministic seeds — safe and predictable
  const commonCitations = [
    "https://examine.com/supplements/",
    "https://www.ncbi.nlm.nih.gov/pubmed/",
  ];

  const mk = (x: Partial<StackItem>, i: number): StackItem => ({
    name: x.name ?? "Omega-3 (EPA+DHA)",
    dose: x.dose ?? "1–2 g/day",
    timing: x.timing ?? "With meals",
    rationale: x.rationale ?? "General support",
    citations: asArray(x.citations).length ? x.citations : commonCitations,
    notes: x.notes,
    order_index: i,
    safety_flag: "safe",
    safety_notes: [],
    amazon_url: null,
    fullscript_url: null,
  });

  const WEIGHT: StackItem[] = [
    mk({ name: "Creatine Monohydrate", dose: "3–5 g/day", timing: "Anytime", rationale: "Lean mass & strength" }, 0),
    mk({ name: "Fish Oil (EPA+DHA)", dose: "1–2 g/day", timing: "With meals", rationale: "Cardio-metabolic support" }, 1),
    mk({ name: "Electrolytes (No Sugar)", dose: "As directed", timing: "During exercise", rationale: "Hydration & performance" }, 2),
    mk({ name: "Green Tea Extract", dose: "250–500 mg", timing: "AM", rationale: "Metabolic support" }, 3),
    mk({ name: "Magnesium Glycinate", dose: "200–400 mg/night", timing: "Evening", rationale: "Sleep & recovery" }, 4),
  ];

  const COGNITION: StackItem[] = [
    mk({ name: "Omega-3 (EPA+DHA)", dose: "1–2 g/day", timing: "With meals", rationale: "Cognitive support" }, 0),
    mk({ name: "Citicoline (CDP-Choline)", dose: "250–500 mg", timing: "AM", rationale: "Attention & memory" }, 1),
    mk({ name: "L-Theanine", dose: "100–200 mg", timing: "With caffeine", rationale: "Smooth focus" }, 2),
    mk({ name: "Magnesium Glycinate", dose: "200–400 mg/night", timing: "Evening", rationale: "Sleep & relaxation" }, 3),
    mk({ name: "Rhodiola Rosea", dose: "200–400 mg", timing: "AM", rationale: "Stress/energy resilience" }, 4),
  ];

  const ENERGY: StackItem[] = [
    mk({ name: "Rhodiola Rosea", dose: "200–400 mg", timing: "AM", rationale: "Fatigue resistance" }, 0),
    mk({ name: "CoQ10", dose: "100–200 mg", timing: "With meals", rationale: "Mitochondrial support" }, 1),
    mk({ name: "Vitamin D3 + K2", dose: "2000 IU + 100 mcg", timing: "With meals", rationale: "General vitality" }, 2),
    mk({ name: "B-Complex", dose: "Per label", timing: "With meals", rationale: "Energy metabolism" }, 3),
    mk({ name: "Creatine Monohydrate", dose: "3–5 g/day", timing: "Anytime", rationale: "Power & energy systems" }, 4),
  ];

  const LONGEVITY: StackItem[] = [
    mk({ name: "Vitamin D3 + K2", dose: "2000 IU + 100 mcg", timing: "With meals", rationale: "Healthy aging" }, 0),
    mk({ name: "Omega-3 (EPA+DHA)", dose: "1–2 g/day", timing: "With meals", rationale: "Cardio/brain support" }, 1),
    mk({ name: "Magnesium Glycinate", dose: "200–400 mg/night", timing: "Evening", rationale: "Sleep & recovery" }, 2),
    mk({ name: "Creatine Monohydrate", dose: "3–5 g/day", timing: "Anytime", rationale: "Healthy aging & strength" }, 3),
    mk({ name: "CoQ10", dose: "100–200 mg", timing: "With meals", rationale: "Mitochondria" }, 4),
  ];

  const goals = (nonEmpty(sub.goals) || "").toLowerCase();
  const list =
    goals.includes("cogn") || goals.includes("brain") ? COGNITION
    : goals.includes("weight") || goals.includes("fat") ? WEIGHT
    : goals.includes("energy") ? ENERGY
    : LONGEVITY;

  // Personalization via prefs (notes)
  const brand = nonEmpty(sub.brand_pref);
  const dosing = nonEmpty(sub.dosing_pref);
  return list.map((it) => {
    const notes = asArray(it.safety_notes); // reuse array
    const add: string[] = [];
    if (brand) add.push(`Brand preference: ${brand}`);
    if (dosing) add.push(`Dosing preference: ${dosing}`);
    const noteText = [it.notes, add.length ? add.join(" • ") : null].filter(Boolean).join(" • ");
    return { ...it, notes: noteText || undefined };
  });
}

async function tryLLMGenerateItems(sub: SubmissionRow): Promise<StackItem[] | null> {
  // Optional LLM path; non-throwing. If OPENAI_API_KEY missing or error, return null.
  if (!process.env.OPENAI_API_KEY) return null;
  try {
    // Lazy import to avoid bundler errors when key is absent
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const OpenAI = (await import("openai")).default;
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const system = [
      "You are LVE360, a supplement and safety planner.",
      "Return a concise, actionable plan.",
      "Do NOT include medical diagnoses.",
      "Be precise with doses and timing.",
    ].join(" ");

    const userContext = {
      email: sub.user_email ?? null,
      goals: nonEmpty(sub.goals) ?? null,
      conditions: asArray(sub.conditions),
      medications: asArray(sub.medications),
      supplements: asArray(sub.supplements),
      hormones: asArray(sub.hormones),
      pregnant: !!sub.pregnant,
      sex: sub.sex ?? null,
      sleep_rating: safeInt(sub.sleep_rating, 0),
      energy_rating: safeInt(sub.energy_rating, 0),
      dosing_pref: nonEmpty(sub.dosing_pref) ?? null,
      brand_pref: nonEmpty(sub.brand_pref) ?? null,
    };

    const prompt = [
      "Create a JSON array of supplement items for the user.",
      "Each item keys: name, dose, timing, rationale, citations[].",
      "Limit to 12 items max. Be conservative if pregnant.",
      "Return ONLY valid JSON (no markdown).",
      JSON.stringify(userContext),
    ].join("\n\n");

    const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
    const resp = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
      temperature: 0.2,
      response_format: { type: "json_object" }, // ensure JSON
    });

    const raw = resp.choices?.[0]?.message?.content?.trim() || "";
    let parsed: any = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // Fallback: try to extract array if model wrapped
      const m = raw.match(/\[[\s\S]*\]$/);
      if (m) parsed = JSON.parse(m[0]);
    }
    const items: StackItem[] = asArray(parsed?.items ?? parsed);
    // Defensive normalization:
    return items.map((it, i) => ({
      name: nonEmpty(it?.name) || `Item ${i + 1}`,
      dose: nonEmpty(it?.dose) || undefined,
      timing: nonEmpty(it?.timing) || undefined,
      rationale: nonEmpty(it?.rationale) || undefined,
      citations: asArray(it?.citations).map(String),
      order_index: i,
      safety_flag: "safe",
      safety_notes: [],
      amazon_url: null,
      fullscript_url: null,
    }));
  } catch (e) {
    console.warn("[generator] LLM path failed, using deterministic seeds.", e);
    return null;
  }
}

async function generateItems(sub: SubmissionRow, mode: GenerateMode): Promise<StackItem[]> {
  // Try LLM if enabled; fallback to deterministic seeds
  const llm = await tryLLMGenerateItems(sub);
  const base = asArray(llm && llm.length ? llm : baseSeedsByGoals(sub));

  // Simple nudge for mode (optional): nothing to do here; actual cap is applied later.
  return base;
}

// ---------- Safety Engine (pregnancy + DB interactions) ---------------------

interface InteractionRow {
  ingredient: string | null;
  binds_thyroid_meds?: boolean | null;
  sep_hours_thyroid?: number | null;
  anticoagulants_bleeding_risk?: boolean | null;
  notes?: string | null;
}

async function applySafetyEngine(
  items: StackItem[],
  sub: SubmissionRow
): Promise<{ status: GeneratedResult["safety_status"]; warnings: string[]; items: StackItem[] }> {
  const warnings: string[] = [];
  const safeItems: StackItem[] = asArray(items).map((it) => ({
    ...it,
    safety_flag: (it.safety_flag as any) || "safe",
    safety_notes: asArray(it.safety_notes),
  }));

  // Pregnancy caution across the board
  if (sub.pregnant) {
    warnings.push("Pregnancy noted — verify all supplements with a clinician.");
    for (const it of safeItems) {
      it.safety_flag = it.safety_flag === "avoid" ? "avoid" : "warning";
      it.safety_notes?.push?.("Pregnancy: verify safety/label dosing.");
    }
  }

  // DB-backed interactions lookup per item (best-effort)
  try {
    for (const it of safeItems) {
      const ingredient = nonEmpty(it.name).toLowerCase();
      if (!ingredient) continue;

      const { data, error } = await supabaseAdmin
        .from("interactions")
        .select("ingredient, binds_thyroid_meds, sep_hours_thyroid, anticoagulants_bleeding_risk, notes")
        .ilike("ingredient", ingredient)
        .limit(1);

      if (error) continue;
      const row = (asArray(data)[0] ?? null) as InteractionRow | null;
      if (!row) continue;

      // Thyroid binding (e.g., iron, calcium, magnesium forms)
      if (row.binds_thyroid_meds) {
        const sep = row.sep_hours_thyroid ?? 4;
        it.safety_flag = it.safety_flag === "avoid" ? "avoid" : "warning";
        (it.safety_notes ?? []).push(`Separate from thyroid meds by ${sep}+ hours.`);
        warnings.push(`${it.name}: separate from thyroid meds.`);
      }

      // Anticoagulant risk (e.g., high-dose fish oil, ginkgo)
      if (row.anticoagulants_bleeding_risk) {
        it.safety_flag = "warning";
        (it.safety_notes ?? []).push("Potential bleeding risk with anticoagulants—consult clinician.");
        warnings.push(`${it.name}: potential bleeding risk with anticoagulants.`);
      }

      if (row.notes) (it.safety_notes ?? []).push(row.notes);
    }
  } catch {
    // Swallow; safety engine is best-effort
  }

  const hasAvoid = safeItems.some((i) => i.safety_flag === "avoid");
  const hasWarn = safeItems.some((i) => i.safety_flag === "warning");
  const status: GeneratedResult["safety_status"] = hasAvoid ? "error" : hasWarn ? "warning" : "safe";

  return { status, warnings: uniq(warnings), items: safeItems };
}

// ---------- Affiliate enrichment --------------------------------------------

function mkAmazonLink(query: string): string {
  // TODO: add your affiliate tag: &tag=lve360-20
  return `https://www.amazon.com/s?k=${encodeURIComponent(query)}`;
}
function mkFullscriptLink(query: string): string {
  // TODO: replace with Fullscript collection deeplink if available
  return `https://us.fullscript.com/search?query=${encodeURIComponent(query)}`;
}

function enrichAffiliateLinks(items: StackItem[]): StackItem[] {
  return asArray(items).map((it) => {
    const q = [it.name, it.dose, it.timing].filter(Boolean).join(" ");
    return {
      ...it,
      amazon_url: it.amazon_url ?? mkAmazonLink(q),
      fullscript_url: it.fullscript_url ?? mkFullscriptLink(it.name),
    };
  });
}

// ---------- Persistence (stacks / stacks_items) ------------------------------

async function upsertStack(
  sub: SubmissionRow,
  items: StackItem[],
  safety: { status: GeneratedResult["safety_status"]; warnings: string[] },
  mode: GenerateMode,
  forceRegenerate: boolean
): Promise<GeneratedResult> {
  const normalized: StackItem[] = asArray(items).map((it, idx) => ({
    name: nonEmpty(it.name) || `Item ${idx + 1}`,
    dose: nonEmpty(it.dose) || undefined,
    timing: nonEmpty(it.timing) || undefined,
    rationale: nonEmpty(it.rationale) || undefined,
    citations: asArray(it.citations).map(String),
    notes: nonEmpty(it.notes) || undefined,
    order_index: typeof it.order_index === "number" ? it.order_index : idx,
    amazon_url: nonEmpty(it.amazon_url) || mkAmazonLink(it.name),
    fullscript_url: nonEmpty(it.fullscript_url) || mkFullscriptLink(it.name),
    safety_flag: (it.safety_flag as any) || "safe",
    safety_notes: asArray(it.safety_notes),
  }));

  // Check for existing stack
  const { data: existing, error: findErr } = await supabaseAdmin
    .from("stacks")
    .select("id, items")
    .eq("submission_id", sub.id)
    .maybeSingle();

  let stackId: string | null = null;

  if (!findErr && existing?.id && !forceRegenerate) {
    // Update existing
    stackId = existing.id;
    const { error: updErr } = await supabaseAdmin
      .from("stacks")
      .update({
        user_id: sub.user_id,
        items: normalized as unknown as Json[],
        safety_status: safety.status,
        safety_warnings: safety.warnings,
        mode,
      })
      .eq("id", stackId);
    if (updErr) throw new Error(`DB error updating stack: ${updErr.message}`);
  } else if (!findErr && existing?.id && forceRegenerate) {
    stackId = existing.id;
    const { error: wipeErr } = await supabaseAdmin
      .from("stacks")
      .update({
        user_id: sub.user_id,
        items: normalized as unknown as Json[],
        safety_status: safety.status,
        safety_warnings: safety.warnings,
        mode,
      })
      .eq("id", stackId);
    if (wipeErr) throw new Error(`DB error overwriting stack: ${wipeErr.message}`);
  } else {
    // Insert new
    const { data: ins, error: insErr } = await supabaseAdmin
      .from("stacks")
      .insert({
        submission_id: sub.id,
        user_id: sub.user_id,
        items: normalized as unknown as Json[],
        safety_status: safety.status,
        safety_warnings: safety.warnings,
        mode,
      })
      .select("id")
      .maybeSingle();
    if (insErr) throw new Error(`DB error inserting stack: ${insErr.message}`);
    stackId = ins?.id ?? null;
  }

  if (!stackId) throw new Error(`Failed to resolve stack id for submission ${sub.id}`);

  // Best-effort sync to stacks_items (optional schema)
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
    if (rows.length) {
      await supabaseAdmin.from("stacks_items").insert(rows);
    }
  } catch (e) {
    console.warn("[generator] stacks_items sync skipped (non-fatal):", e);
  }

  return {
    stack_id: stackId,
    items: normalized,
    safety_status: safety.status,
    safety_warnings: safety.warnings,
  };
}

// ---------- Main: generateStackForSubmission --------------------------------

export async function generateStackForSubmission(
  submissionId: string,
  options?: GenerateOptions
): Promise<{ markdown: string; raw: GeneratedResult }> {
  const mode: GenerateMode = options?.mode === "premium" ? "premium" : "free";
  const defaultCap = mode === "free" ? 3 : 12;
  const cap = typeof options?.maxItems === "number" ? clamp(options.maxItems, 1, 20) : defaultCap;
  const forceRegenerate = !!options?.forceRegenerate;

  // 1) Load submission
  const sub = await getSubmission(submissionId);

  // 2) Generate items (LLM or deterministic)
  const gen = await generateItems(sub, mode);

  // 3) Cap for Free (or use provided cap)
  const capped = asArray(gen).slice(0, cap);

  // 4) Affiliate enrichment
  const enriched = enrichAffiliateLinks(capped);

  // 5) Safety engine
  const { status, warnings, items: safeItems } = await applySafetyEngine(enriched, sub);

  // 6) Persist to stacks (+ stacks_items best-effort)
  const persisted = await upsertStack(sub, safeItems, { status, warnings }, mode, forceRegenerate);

  // 7) Markdown Blueprint
  let md = toMarkdown(sub, persisted.items, persisted.safety_status, persisted.safety_warnings);

  // 8) Validate + fallback tighten
  const v = validateMarkdownBlueprint(md);
  console.info("validation.debug", v);
  if (!v.wordCountOK || !v.headingsValid || !v.blueprintValid || !v.narrativesValid) {
    // fallback: tighten and (if still invalid) synthesize a minimal blueprint
    let tightened = tightenMarkdown(md);
    const v2 = validateMarkdownBlueprint(tightened);
    console.info("validation.debug.fallback", v2);
    if (!v2.headingsValid || !v2.blueprintValid) {
      tightened = minimalBlueprintFromItems(sub, persisted.items);
    }
    md = tightened;
  }

  return { markdown: md, raw: persisted };
}
