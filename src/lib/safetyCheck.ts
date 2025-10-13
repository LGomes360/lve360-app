// -----------------------------------------------------------------------------
// File: lib/safetyCheck.ts
// Hybrid Safety Rule Evaluator for LVE360
// • Primary: pulls interactions dynamically from Supabase
// • Fallback: uses static rules if Supabase is unreachable or errors
// -----------------------------------------------------------------------------

import { createClient } from "@supabase/supabase-js";

export type SafetyInput = {
  medications?: string[];
  supplements?: string[];
  conditions?: string[];
  pregnant?: string | null;
};

export type SafetyWarning = {
  code: string;
  severity: "info" | "warning" | "danger";
  message: string;
  recommendation?: string;
  refs?: string[];
};

// -------------------------
// Setup Supabase client (backend only)
// -------------------------
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY! // backend only
);

// -------------------------
// Helper
// -------------------------
const includesAny = (hay: string[] = [], needles: string[] = []) =>
  hay.some((h) => needles.some((n) => h.toLowerCase().includes(n.toLowerCase())));

// -------------------------
// Static fallback safety rules (subset of your original)
// -------------------------
function evaluateSafetyStatic(input: SafetyInput): SafetyWarning[] {
  const meds = (input.medications ?? []).map((m) => m.toLowerCase());
  const supps = (input.supplements ?? []).map((s) => s.toLowerCase());
  const conds = (input.conditions ?? []).map((c) => c.toLowerCase());
  const out: SafetyWarning[] = [];

  if (includesAny(meds, ["levothyroxine", "liothyronine", "thyroid"])) {
    if (includesAny(supps, ["calcium", "iron", "magnesium", "zinc"])) {
      out.push({
        code: "thyroid_spacing",
        severity: "warning",
        message:
          "Mineral supplements (Ca, Fe, Mg, Zn) can bind thyroid meds and reduce absorption.",
        recommendation: "Take thyroid meds on empty stomach; separate by ≥4 hours.",
      });
    }
  }

  if (includesAny(meds, ["warfarin", "eliquis", "xarelto", "apixaban"])) {
    if (includesAny(supps, ["fish oil", "omega", "garlic", "ginkgo", "vitamin e"])) {
      out.push({
        code: "bleeding_risk",
        severity: "warning",
        message:
          "Certain supplements (omega-3s, garlic, ginkgo, vitamin E) may increase bleeding risk.",
        recommendation: "Consult clinician and monitor for bruising or bleeding.",
      });
    }
  }

  if ((input.pregnant ?? "").toLowerCase() === "yes") {
    if (includesAny(supps, ["vitamin a", "retinol", "licorice", "dong quai"])) {
      out.push({
        code: "pregnancy_caution",
        severity: "danger",
        message:
          "Some botanicals and high-dose vitamin A are unsafe in pregnancy.",
        recommendation:
          "Avoid retinol and uterotonic herbs unless cleared by your provider.",
      });
    }
  }

  if (includesAny(conds, ["liver", "hepatitis"])) {
    if (includesAny(supps, ["kava", "green tea extract", "black cohosh"])) {
      out.push({
        code: "liver_caution",
        severity: "warning",
        message: "Certain botanicals can stress the liver.",
        recommendation: "Avoid or monitor liver enzymes periodically.",
      });
    }
  }

  return out;
}

// -------------------------
// Dynamic version (Supabase-driven)
// -------------------------
let cachedInteractions: any[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function evaluateSafetyDynamic(input: SafetyInput): Promise<SafetyWarning[]> {
  const now = Date.now();
  if (!cachedInteractions || now - cacheTimestamp > CACHE_TTL_MS) {
    const { data, error } = await supabase.from("interactions").select("*");
    if (error) throw new Error(error.message);
    cachedInteractions = data || [];
    cacheTimestamp = now;
  }

  const meds = (input.medications ?? []).map((m) => m.toLowerCase());
  const supps = (input.supplements ?? []).map((s) => s.toLowerCase());
  const conds = (input.conditions ?? []).map((c) => c.toLowerCase());
  const out: SafetyWarning[] = [];

  for (const rule of cachedInteractions) {
    const ing = (rule.ingredient ?? "").toLowerCase();
    if (!includesAny(supps, [ing])) continue;

    if (rule.binds_thyroid_meds && includesAny(meds, ["levothyroxine", "thyroid"])) {
      out.push({
        code: "thyroid_spacing",
        severity: "warning",
        message: `${rule.ingredient} may bind thyroid meds.`,
        recommendation: rule.notes || "Separate by 4 hours.",
      });
    }
    if (rule.anticoagulants_bleeding_risk && includesAny(meds, ["warfarin", "eliquis", "xarelto", "apixaban"])) {
      out.push({
        code: "bleeding_risk",
        severity: "warning",
        message: `${rule.ingredient} may increase bleeding risk.`,
        recommendation: rule.notes || "Monitor closely.",
      });
    }
    if (rule.diabetes_meds_additive && includesAny(meds, ["metformin", "insulin", "glipizide"])) {
      out.push({
        code: "blood_sugar_additive",
        severity: "warning",
        message: `${rule.ingredient} may lower blood glucose further.`,
        recommendation: rule.notes || "Monitor glucose levels.",
      });
    }
    if (rule.pregnancy_caution && (input.pregnant ?? "").toLowerCase() === "yes") {
      out.push({
        code: "pregnancy_caution",
        severity: "danger",
        message: `${rule.ingredient} not recommended during pregnancy.`,
        recommendation: rule.notes || "Avoid unless prescribed.",
      });
    }
    if (rule.liver_disease_caution && includesAny(conds, ["liver", "hepatitis", "cirrhosis"])) {
      out.push({
        code: "liver_caution",
        severity: "warning",
        message: `${rule.ingredient} may stress the liver.`,
        recommendation: rule.notes || "Use cautiously.",
      });
    }
    if (rule.kidney_disease_caution && includesAny(conds, ["renal", "kidney"])) {
      out.push({
        code: "kidney_caution",
        severity: "warning",
        message: `${rule.ingredient} may increase kidney workload.`,
        recommendation: rule.notes || "Stay hydrated, avoid high doses.",
      });
    }
  }

  return out;
}

// -------------------------
// Hybrid export
// -------------------------
export async function evaluateSafety(input: SafetyInput): Promise<SafetyWarning[]> {
  try {
    const dynamic = await evaluateSafetyDynamic(input);
    if (dynamic.length) return dynamic;
    console.warn("⚠️ No DB-based rules matched; falling back to static rules.");
    return evaluateSafetyStatic(input);
  } catch (err) {
    console.error("⚠️ Safety DB check failed:", (err as Error).message);
    return evaluateSafetyStatic(input);
  }
}
