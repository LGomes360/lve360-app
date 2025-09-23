// -----------------------------------------------------------------------------
// File: src/lib/safetyCheck.ts
// Purpose: Post-process stack items to enforce safety rules & add cautions.
// Sources: Supabase tables `rules`, `interactions`, and user submission fields.
// -----------------------------------------------------------------------------

import { supabaseAdmin as supa } from "@/lib/supabaseAdmin";

export type SafetyIssue = {
  item?: string | null;
  type:
    | "UL_CAP"
    | "AVOID"
    | "SPACING"
    | "INTERACTION"
    | "ALLERGY"
    | "PREGNANCY"
    | "PREFERENCE"
    | "INFO";
  message: string;
  details?: Record<string, unknown>;
};

export type StackItem = {
  supplement_id?: string;
  name: string;
  dose?: string | null;
  timing?: string | null;
  notes?: string | null;
  rationale?: string | null;
  caution?: string | null;
  citations?: string[] | null;
  link?: string | null;
};

export type SubmissionSafetyInput = {
  medications?: string[];
  conditions?: string[];
  allergies?: string[];
  pregnant?: string | boolean | null;
  brand_pref?: string | null;
  dosing_pref?: string | null;
};

type RuleRow = {
  id: string;
  rule_type: "UL" | "AVOID" | "SPACING";
  entity_a_name?: string | null;
  counterparty_name?: string | null;
  max_daily_amount?: number | null;
  unit?: string | null;
  spacing_hours?: number | null;
  message?: string | null;
  source_url?: string | null;
};

type InteractionRow = {
  ingredient: string;
  anticoagulants_bleeding_risk?: boolean;
  binds_thyroid_meds?: boolean;
  pregnancy_caution?: boolean;
  liver_disease_caution?: boolean;
  kidney_disease_caution?: boolean;
  caffeine_stimulant_caution?: boolean;
  notes?: string | null;
};

const SSRI_LIST = [
  "sertraline", "fluoxetine", "citalopram", "escitalopram", "paroxetine", "fluvoxamine"
];
const ANTICOAG_LIST = [
  "warfarin", "apixaban", "rivaroxaban", "edoxaban", "dabigatran", "clopidogrel", "ticagrelor"
];

function lc(x?: string | null) { return (x ?? "").trim().toLowerCase(); }
function present<T>(a?: T | null): a is T { return a !== undefined && a !== null; }
function isYes(x?: string | boolean | null) {
  if (typeof x === "boolean") return x;
  const s = lc(String(x));
  return s === "yes" || s === "y" || s === "true" || s === "pregnant";
}

function normalizeUnit(u?: string | null) {
  const s = lc(u);
  if (s === "μg" || s === "mcg" || s === "ug") return "mcg";
  if (s === "iu") return "IU";
  if (s === "mg" || s === "g") return s;
  return s || null;
}

function parseDose(dose?: string | null): { amount?: number; unit?: string } {
  if (!dose) return {};
  const cleaned = dose.replace(/[,]/g, " ").replace(/\s+/g, " ");
  const matches = cleaned.match(/(\d+(?:\.\d+)?)/g);
  if (!matches) return {};
  const amount = parseFloat(matches[matches.length - 1]);
  const unitMatch = cleaned.match(/(mcg|μg|ug|mg|g|iu)\b/i);
  const rawUnit = unitMatch ? unitMatch[1] : "";
  let unit = normalizeUnit(rawUnit);
  let val = amount;
  if (unit === "g") { val = amount * 1000; unit = "mg"; }
  return { amount: val, unit: unit ?? undefined };
}

function sameUnit(u1?: string, u2?: string) {
  if (!u1 || !u2) return false;
  return normalizeUnit(u1) === normalizeUnit(u2);
}

function containsAny(haystack: string[], needles: string[]) {
  const set = new Set(haystack.map(lc));
  return needles.some(n => set.has(lc(n)));
}

async function fetchRules(): Promise<RuleRow[]> {
  const { data } = await supa.from("rules").select("*").in("rule_type", ["UL", "AVOID", "SPACING"] as any);
  return (data ?? []) as RuleRow[];
}

async function fetchInteractionsFor(ingredient: string): Promise<InteractionRow | null> {
  let q = supa.from("interactions").select("*").eq("ingredient", ingredient).maybeSingle();
  let { data } = await q;
  if (data) return data as InteractionRow;
  const { data: list } = await supa.from("interactions").select("*").ilike("ingredient", `%${ingredient}%`).limit(1);
  return list?.[0] ?? null;
}

function allergyHits(ingredient: string, allergies: string[]): string[] {
  const ing = lc(ingredient);
  const a = allergies.map(lc);
  const hits: string[] = [];
  for (const al of a) {
    if (!al) continue;
    if (ing.includes(al)) hits.push(al);
    if (al === "shellfish" && (ing.includes("krill") || ing.includes("glucosamine"))) hits.push("shellfish");
    if (al === "soy" && ing.includes("soy")) hits.push("soy");
  }
  return Array.from(new Set(hits));
}

function appendCaution(item: StackItem, text: string) {
  item.caution = item.caution ? `${item.caution} ${text}` : text;
}

// -----------------------------------------------------------------------------
// Main export
// -----------------------------------------------------------------------------
export async function applySafetyChecks(
  submission: SubmissionSafetyInput,
  items: StackItem[]
): Promise<{ cleaned: StackItem[]; notes: SafetyIssue[] }> {

  const notes: SafetyIssue[] = [];
  const meds = (submission.medications ?? []).map(lc);
  const conds = (submission.conditions ?? []).map(lc);
  const allergies = (submission.allergies ?? []).map(lc);
  const isPreg = isYes(submission.pregnant);

  const rules = await fetchRules();
  const ULs = rules.filter(r => r.rule_type === "UL");
  const AVOIDs = rules.filter(r => r.rule_type === "AVOID");
  const SPACINGs = rules.filter(r => r.rule_type === "SPACING");

  const out: StackItem[] = [];
  for (const raw of items) {
    const item: StackItem = { ...raw };
    const nameLC = lc(item.name);
    const interact = await fetchInteractionsFor(item.name);

    // 1) UL check
    const ul = ULs.find(r => lc(r.counterparty_name) === nameLC || lc(r.entity_a_name) === nameLC);
    if (ul && present(ul.max_daily_amount) && ul.unit) {
      const { amount, unit } = parseDose(item.dose);
      const ruleUnit = normalizeUnit(ul.unit);
      if (present(amount) && ruleUnit && sameUnit(unit, ruleUnit)) {
        const max = ul.max_daily_amount!;
        if (amount! > max) {
          item.dose = `${max} ${ruleUnit}`;
          appendCaution(item, `Dose reduced to UL (${max} ${ruleUnit}).`);
          notes.push({ item: item.name, type: "UL_CAP", message: `Capped at ${max} ${ruleUnit}`, details: { previous: amount } });
        }
      }
    }

    // 2) AVOID rules
    for (const r of AVOIDs) {
      const a = lc(r.entity_a_name);
      const b = lc(r.counterparty_name);
      const userHasA = a && (meds.includes(a) || conds.includes(a) || SSRI_LIST.includes(a));
      const userHasB = b && (meds.includes(b) || conds.includes(b) || SSRI_LIST.includes(b));
      const matchesItemA = a && a === nameLC;
      const matchesItemB = b && b === nameLC;
      const conflict =
        (userHasA && matchesItemB) ||
        (userHasB && matchesItemA) ||
        ((containsAny(meds, SSRI_LIST) || conds.includes("maoi")) &&
          (nameLC.includes("5-htp") || nameLC.includes("st. john")));
      if (conflict) {
        notes.push({ item: item.name, type: "AVOID", message: r.message || "Avoid interaction", details: { rule: r } });
        continue;
      }
    }

    // 3) SPACING rules
    for (const r of SPACINGs) {
      const a = lc(r.entity_a_name);
      const b = lc(r.counterparty_name);
      const matchesItem = a === nameLC || b === nameLC;
      const userHasOther = meds.includes(a) || conds.includes(a) || meds.includes(b) || conds.includes(b);
      if (matchesItem && userHasOther) {
        const hours = r.spacing_hours ?? 2;
        const msg = r.message || `Separate by at least ${hours} hours.`;
        appendCaution(item, msg);
        notes.push({ item: item.name, type: "SPACING", message: msg });
      }
    }

    // 4) Interaction flags
    if (interact) {
      if (interact.anticoagulants_bleeding_risk && containsAny(meds, ANTICOAG_LIST)) {
        appendCaution(item, "Bleeding risk with anticoagulants.");
        notes.push({ item: item.name, type: "INTERACTION", message: "Bleeding risk with anticoagulants" });
      }
      if (interact.binds_thyroid_meds && meds.some(m => lc(m).includes("levothyroxine"))) {
        appendCaution(item, "Separate from thyroid meds by 4+ hours.");
        notes.push({ item: item.name, type: "SPACING", message: "Separate from thyroid meds by 4+ hours" });
      }
      if (interact.pregnancy_caution && isPreg) {
        appendCaution(item, "Not advised in pregnancy unless clinician approves.");
        notes.push({ item: item.name, type: "PREGNANCY", message: "Pregnancy caution" });
      }
      if (interact.liver_disease_caution && conds.some(c => c.includes("liver"))) {
        appendCaution(item, "Caution with liver conditions.");
        notes.push({ item: item.name, type: "INTERACTION", message: "Liver condition caution" });
      }
      if (interact.kidney_disease_caution && conds.some(c => c.includes("kidney"))) {
        appendCaution(item, "Caution with kidney conditions.");
        notes.push({ item: item.name, type: "INTERACTION", message: "Kidney condition caution" });
      }
    }

    // 5) Allergies
    const hits = allergyHits(item.name, allergies);
    if (hits.length) {
      appendCaution(item, `Allergy flags: ${hits.join(", ")}.`);
      notes.push({ item: item.name, type: "ALLERGY", message: `Allergy: ${hits.join(", ")}` });
    }

    out.push(item);
  }

  notes.push({ type: "INFO", message: "Educational only; not medical advice. Always consult a provider." });

  return { cleaned: out, notes };
}
