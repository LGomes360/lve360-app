/* eslint-disable no-console */

/**
 * generateStack.ts (reconciled)
 * - Keeps: evidence -> prompt, safety checks, affiliate enrichment, markdown->items, Supabase writes
 * - Adds: unified callOpenAI wrapper usage (GPT-5/4), smarter timing/name normalization, stricter parsing guards
 */

import { supabaseAdmin } from "@/lib/supabase";
import { callOpenAI, type NormalizedLLMResponse, type ChatMsg } from "@/lib/openai";
import parseMarkdownToItems from "@/lib/parseMarkdownToItems";
import { applySafetyChecks } from "@/lib/safetyCheck";
import { enrichAffiliateLinks } from "@/lib/affiliateLinks";
import { getTopCitationsFor } from "@/lib/evidence";

// ---------- Types ----------
type GenerateMode = "initial" | "revision";

type GenerateOptions = {
  submissionId: string;
  mode?: GenerateMode;               // default "initial"
  modelOrderMain?: string[];         // e.g., ["gpt-5", "gpt-4o"]
  modelOrderMini?: string[];         // e.g., ["gpt-5-mini", "gpt-4o-mini"]
  maxTokens?: number;                // model output cap
  timeoutMs?: number;                // per-call timeout
};

type StackRow = {
  id: string;
  user_id: string | null;
  submission_id: string;
  status: "draft" | "final";
  blueprint_md: string | null;
  dosing_md: string | null;
  notes_md: string | null;
  created_at?: string;
  updated_at?: string;
};

type StackItem = {
  id?: string;
  stack_id: string;
  name: string;
  form?: string | null;
  dose?: string | null;
  unit?: string | null;
  frequency?: string | null;
  timing?: string | null;        // "AM", "PM", "With Food", etc.
  rationale?: string | null;
  safety_flags?: string[] | null; // contraindications etc.
  source_url?: string | null;     // enriched affiliate link
  brand?: string | null;
  raw?: any;                      // keep original parsed chunk for debugging
};

// ---------- Helpers: timing & names ----------
function normalizeTimingLabel(s?: string | null): string | null {
  if (!s) return null;
  const v = s.trim().toLowerCase();

  // common buckets
  if (/(^|\W)(am|morning|breakfast)\b/.test(v)) return "AM";
  if (/(^|\W)(pm|evening|bed|night)\b/.test(v)) return "PM";
  if (/(^|\W)(lunch|midday|noon)\b/.test(v)) return "Midday";
  if (/with food|with meal|w\/ food/.test(v)) return "With Food";
  if (/empty stomach|fasted|fasting/.test(v)) return "Empty Stomach";
  return s.trim();
}

function normalizeName(s: string): string {
  // lightly normalize supplement/med names
  return s.replace(/\s+/g, " ").replace(/\(.*?\)/g, "").trim();
}

// ---------- Helpers: LLM w/ fallback ----------
async function callWithFallback(
  messages: ChatMsg[] | string,
  modelOrder: string[],
  opts: { maxTokens?: number; timeoutMs?: number }
): Promise<{ res: NormalizedLLMResponse; used: string }> {
  let lastErr: any = null;
  for (const m of modelOrder) {
    try {
      const res = await callOpenAI(m, messages, {
        maxTokens: opts.maxTokens ?? 900,
        timeoutMs: opts.timeoutMs ?? 40_000,
      });
      const text = (res.text || "").trim();
      if (text) return { res, used: res.modelUsed || m };
      // allow structured-only response (Responses API sometimes returns tokens but empty text)
      // if so, we keep __raw and let the parser try to extract from known blocks
      if (!text && res.__raw) return { res, used: res.modelUsed || m };
      throw new Error(`[callWithFallback] model ${m} returned empty text`);
    } catch (e) {
      lastErr = e;
      console.warn(`[callWithFallback] model ${m} failed`, e);
    }
  }
  throw (lastErr || new Error("All models failed"));
}

// ---------- Prompt builders ----------
function buildSystemPrompt(): string {
  return [
    "You are LVE360’s supplement stack planner.",
    "Return exactly two Markdown sections:",
    "1) ## Blueprint — 3–7 bullets, plain English plan by goal.",
    "2) ## Dosing & Notes — table-like bullets for each item with: Name | Form | Dose + Unit | Frequency | Timing | Rationale.",
    "Rules:",
    "- Be conservative; prefer well-studied, safe options.",
    "- Reflect user meds/conditions/allergies; avoid contraindications.",
    "- Use simple names (normalize brand/proprietary blends to generic compounds).",
    "- Timing buckets: AM, Midday, PM, With Food, Empty Stomach.",
    "- If unclear, you must choose a reasonable default.",
  ].join("\n");
}

function buildUserPrompt(ctx: {
  profile: string;         // age/sex/weight/height/goals
  meds: string[];          // normalized meds list
  supplements: string[];   // normalized current supplements
  allergies: string[];
  conditions: string[];
  timingPref?: string | null;
  citationsTop?: Array<{ id: string; title: string }>;
}): string {
  const lines: string[] = [];
  lines.push("User Profile:");
  lines.push(ctx.profile);
  if (ctx.goals) lines.push(`Goals: ${ctx.goals}`);
  if (ctx.meds.length) lines.push(`Medications: ${ctx.meds.join(", ")}`);
  if (ctx.supplements.length) lines.push(`Current Supplements: ${ctx.supplements.join(", ")}`);
  if (ctx.allergies.length) lines.push(`Allergies: ${ctx.allergies.join(", ")}`);
  if (ctx.conditions.length) lines.push(`Conditions: ${ctx.conditions.join(", ")}`);
  if (ctx.timingPref) lines.push(`Timing Preference: ${ctx.timingPref}`);

  if (ctx.citationsTop?.length) {
    lines.push("Evidence anchors to prioritize (IDs are internal lookup keys):");
    ctx.citationsTop.slice(0, 6).forEach((c, i) => lines.push(`- (${i + 1}) ${c.title}`));
  }

  lines.push("");
  lines.push("Output strictly in the two-section Markdown format described in the System message.");
  return lines.join("\n");
}

// ---------- DB helpers ----------
async function upsertStackRecord(params: {
  submissionId: string;
  status: "draft" | "final";
  blueprint_md: string | null;
  dosing_md: string | null;
  notes_md: string | null;
  tally_submission_id?: string | null;
}): Promise<StackRow> {
  const { data, error } = await supabaseAdmin
    .from("stacks")
    .upsert(
      {
        submission_id: params.submissionId,
        status: params.status,
        blueprint_md: params.blueprint_md,
        dosing_md: params.dosing_md,
        notes_md: params.notes_md,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "submission_id" }
    )
    .select("*")
    .single();

  if (error) throw error;
  return data as unknown as StackRow;
}

async function insertStackItems(stackId: string, items: StackItem[]) {
  if (!items.length) return;
  const payload = items.map((it) => ({
    stack_id: stackId,
    name: normalizeName(it.name),
    form: it.form ?? null,
    dose: it.dose ?? null,
    unit: it.unit ?? null,
    frequency: it.frequency ?? null,
    timing: normalizeTimingLabel(it.timing) ?? null,
    rationale: it.rationale ?? null,
    safety_flags: it.safety_flags ?? null,
    source_url: it.source_url ?? null,
    brand: it.brand ?? null,
    raw: it.raw ?? null,
  }));
  const { error } = await supabaseAdmin.from("stacks_items").insert(payload);
  if (error) throw error;
}

// ---------- Parsing guards ----------
function splitMarkdownSections(md: string): { blueprint: string | null; dosing: string | null } {
  const s = md || "";
  const m1 = s.split(/^\s*##\s*Blueprint\s*$/im);
  if (m1.length < 2) return { blueprint: null, dosing: null };
  const rest = m1[1];
  const m2 = rest.split(/^\s*##\s*Dosing\s*&\s*Notes\s*$/im);
  if (m2.length < 2) {
    return { blueprint: rest.trim(), dosing: null };
  }
  const blueprint = m2[0].trim();
  const dosing = m2[1].trim();
  return { blueprint, dosing };
}

// ---------- Public API ----------
export async function generateStackForSubmission(opts: GenerateOptions) {
  const {
    submissionId,
    mode = "initial",
    modelOrderMain = ["gpt-5", "gpt-4o"],
    modelOrderMini = ["gpt-5-mini", "gpt-4o-mini"],
    maxTokens = 900,
    timeoutMs = 40_000,
  } = opts;

  if (!submissionId) throw new Error("submissionId required");

  // 1) Load submission context (kept lightweight; assumes your 'submissions' table has these columns)
  const { data: sub, error: subErr } = await supabaseAdmin
    .from("submissions")
    .select("*")
    .eq("id", submissionId)
    .single();
  if (subErr) throw subErr;

  // Build profile text
  const profileBits = [];
  if (sub?.name) profileBits.push(`Name: ${sub.name}`);
  if (sub?.dob || sub?.age) profileBits.push(`DOB/Age: ${sub.dob ?? sub.age ?? "N/A"}`);
  if (sub?.sex) profileBits.push(`Sex: ${sub.sex}`);
  if (sub?.height || sub?.weight) profileBits.push(`Height/Weight: ${sub.height ?? "?"}/${sub.weight ?? "?"}`);
  const profile = profileBits.join(" | ");

  // Pull goals, meds, supplements, allergies, conditions from submission (keep keys generic—your DB schema provides them)
  const goals = (sub?.goals_text ?? sub?.goals ?? "") as string;
  const meds = (Array.isArray(sub?.medications) ? sub.medications : (sub?.medications_list ?? "")) as string[] | string;
  const supplements = (Array.isArray(sub?.supplements) ? sub.supplements : (sub?.supplements_list ?? "")) as string[] | string;
  const allergies = (Array.isArray(sub?.allergies) ? sub.allergies : (sub?.allergies_list ?? "")) as string[] | string;
  const conditions = (Array.isArray(sub?.conditions) ? sub.conditions : (sub?.conditions_list ?? "")) as string[] | string;

  const medsArr = (Array.isArray(meds) ? meds : String(meds || "").split(/[;,]\s*|\n+/)).map((s) => normalizeName(s)).filter(Boolean);
  const suppArr = (Array.isArray(supplements) ? supplements : String(supplements || "").split(/[;,]\s*|\n+/)).map((s) => normalizeName(s)).filter(Boolean);
  const allergyArr = (Array.isArray(allergies) ? allergies : String(allergies || "").split(/[;,]\s*|\n+/)).map((s) => s.trim()).filter(Boolean);
  const condArr = (Array.isArray(conditions) ? conditions : String(conditions || "").split(/[;,]\s*|\n+/)).map((s) => s.trim()).filter(Boolean);
  const timingPref = normalizeTimingLabel(sub?.dosing_pref ?? sub?.timing_pref ?? null);

  // Top evidence to anchor
  const citationsTop = getTopCitationsFor?.(goals ?? "", medArrayToString(medsArr)) ?? [];

  // 2) Build messages
  const messages: ChatMsg[] = [
    { role: "system", content: buildSystemPrompt() },
    {
      role: "user",
      content: buildUserPrompt({
        profile,
        meds: medsArr,
        supplements: suppArr,
        allergies: allergyArr,
        conditions: condArr,
        timingPref,
        // @ts-expect-error (older evidence helper returns {id,title,url}? we use title only)
        citationsTop,
        // @ts-ignore include goals as property consumed in builder
        goals,
      }),
    },
  ];

  // 3) Call LLM with fallbacks (main → mini)
  let combined: NormalizedLLMResponse | null = null;
  let usedModel = "";
  try {
    const stepA = await callWithFallback(messages, modelOrderMain, { maxTokens, timeoutMs });
    combined = stepA.res;
    usedModel = stepA.used;
  } catch (eA) {
    console.warn("[generateStack] main models failed; trying mini set", eA);
    const stepB = await callWithFallback(messages, modelOrderMini, { maxTokens, timeoutMs });
    combined = stepB.res;
    usedModel = stepB.used;
  }
  const mdRaw = (combined?.text || "").trim();

  // 4) Parse sections; if text is empty but __raw has blocks, try to salvage
  let blueprint = "";
  let dosing = "";
  if (mdRaw) {
    const { blueprint: bp, dosing: dn } = splitMarkdownSections(mdRaw);
    blueprint = bp ?? "";
    dosing = dn ?? "";
  } else if (combined?.__raw) {
    // Last resort: stringify and try to carve out output_text/summary_text
    const probable = extractAnyTextFromRaw(combined.__raw);
    const { blueprint: bp, dosing: dn } = splitMarkdownSections(probable);
    blueprint = bp ?? "";
    dosing = dn ?? "";
  }

  // 5) Upsert stack (draft)
  const stack = await upsertStackRecord({
    submissionId,
    status: "draft",
    blueprint_md: blueprint || null,
    dosing_md: dosing || null,
    notes_md: null,
    tally_submission_id: (sub as any)?.tally_submission_id ?? null,
  });

  // 6) Parse → items
  const itemsRaw = parseMarkdownToItems(dosing || blueprint || "");
  // normalize timing/name fields now
  const itemsNormalized: StackItem[] = itemsRaw.map((it: any) => ({
    stack_id: stack.id,
    name: normalizeName(it?.name ?? ""),
    form: it?.form ?? null,
    dose: it?.dose ?? null,
    unit: it?.unit ?? null,
    frequency: it?.frequency ?? null,
    timing: normalizeTimingLabel(it?.timing ?? timingPref ?? null),
    rationale: it?.rationale ?? null,
    safety_flags: null,
    source_url: it?.source_url ?? null,
    brand: it?.brand ?? null,
    raw: it,
  })).filter(x => x.name);

  // 7) Safety checks
  const itemsSafe = await applySafetyChecks(itemsNormalized, {
    meds: medsArr,
    conditions: condArr,
    allergies: allergyArr,
  });

  // 8) Affiliate enrichment
  const itemsEnriched = await enrichAffiliateLinks(itemsSafe);

  // 9) Persist items
  await insertStackItems(stack.id, itemsEnriched);

  return {
    ok: true as const,
    stack_id: stack.id,
    model_used: usedModel,
    counts: {
      items_raw: itemsRaw?.length ?? 0,
      items_enriched: itemsEnriched?.length ?? 0,
    },
  };
}

// ---------- tiny helpers ----------
function extractAnyTextFromRaw(raw: any): string {
  try {
    if (typeof raw?.output_text === "string" && raw.output_text.trim()) return raw.output_text.trim();
    if (typeof raw?.summary_text === "string" && raw.summary_text.trim()) return raw.summary_text.trim();

    const gather = (node: any): string => {
      if (!node) return "";
      if (typeof node === "string") return node;
      if (Array.isArray(node)) return node.map(gather).join("\n");
      if (typeof node === "object") {
        if (typeof node.output_text === "string") return node.output_text;
        if (typeof node.summary_text === "string") return node.summary_text;
        if (typeof node.text === "string") return node.text;
        return ["output", "content", "summary", "message"]
          .map((k) => gather(node[k]))
          .filter(Boolean)
          .join("\n");
      }
      return "";
    };
    return gather(raw).trim();
  } catch {
    return "";
  }
}

function medArrayToString(arr: string[]): string {
  return arr.filter(Boolean).join(", ");
}

export default generateStackForSubmission;
