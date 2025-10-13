// -----------------------------------------------------------------------------
// File: lib/safetyCheckDynamic.ts
// Purpose: Pull safety rules dynamically from Supabase interactions table.
// -----------------------------------------------------------------------------

import { createClient } from "@supabase/supabase-js";
import type { SafetyInput, SafetyWarning } from "@/lib/safetyCheck"; // reuse the same types

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY! // Use service key only on backend routes
);

// -------------------------
// Helper
// -------------------------
const includesAny = (hay: string[] = [], needles: string[] = []) =>
  hay.some((h) => needles.some((n) => h.toLowerCase().includes(n.toLowerCase())));

// Optional cache to reduce DB hits
let cachedInteractions: any[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// -------------------------
// Main Evaluation Function
// -------------------------
export async function evaluateSafetyDynamic(
  input: SafetyInput
): Promise<SafetyWarning[]> {
  const now = Date.now();

  // 1️⃣ Fetch interactions (with simple cache)
  if (!cachedInteractions || now - cacheTimestamp > CACHE_TTL_MS) {
    const { data, error } = await supabase.from("interactions").select("*");
    if (error) {
      console.error("⚠️ Error loading interactions:", error.message);
      return [
        {
          code: "db_error",
          severity: "error",
          message: "Failed to load safety interactions from database.",
        },
      ];
    }
    cachedInteractions = data || [];
    cacheTimestamp = now;
  }

  const meds = (input.medications ?? []).map((m) => m.toLowerCase());
  const supps = (input.supplements ?? []).map((s) => s.toLowerCase());
  const conds = (input.conditions ?? []).map((c) => c.toLowerCase());
  const out: SafetyWarning[] = [];

  // 2️⃣ Iterate through interaction rows
  for (const rule of cachedInteractions) {
    const ing = (rule.ingredient ?? "").toLowerCase();

    // Check if supplement is in user's list
    if (!includesAny(supps, [ing])) continue;

    // --- Thyroid meds ---
    if (rule.binds_thyroid_meds && includesAny(meds, ["levothyroxine", "liothyronine", "thyroid"])) {
      out.push({
        code: "thyroid_spacing",
        severity: "warning",
        message: `${rule.ingredient} may bind thyroid medication and reduce absorption.`,
        recommendation: rule.notes || "Separate doses by at least 4 hours.",
      });
    }

    // --- Anticoagulant bleeding risk ---
    if (rule.anticoagulants_bleeding_risk && includesAny(meds, ["warfarin", "eliquis", "xarelto", "apixaban"])) {
      out.push({
        code: "bleeding_risk",
        severity: "warning",
        message: `${rule.ingredient} may increase bleeding risk with anticoagulants.`,
        recommendation: rule.notes || "Monitor and consult your clinician.",
      });
    }

    // --- Diabetes additive risk ---
    if (rule.diabetes_meds_additive && includesAny(meds, ["metformin", "insulin", "glipizide", "empagliflozin"])) {
      out.push({
        code: "blood_sugar_additive",
        severity: "warning",
        message: `${rule.ingredient} may enhance glucose-lowering effects of medications.`,
        recommendation: rule.notes || "Monitor glucose closely.",
      });
    }

    // --- Sedative additive risk ---
    if (rule.sedatives_additive) {
      out.push({
        code: "sedative_additive",
        severity: "info",
        message: `${rule.ingredient} may increase sedation if combined with CNS depressants.`,
        recommendation: rule.notes || "Use cautiously or at bedtime.",
      });
    }

    // --- Antibiotic interaction ---
    if (rule.antibiotics_interaction) {
      out.push({
        code: "antibiotic_interaction",
        severity: "warning",
        message: `${rule.ingredient} may interfere with antibiotic absorption or efficacy.`,
        recommendation: rule.notes || "Separate by several hours.",
      });
    }

    // --- Pregnancy caution ---
    if (rule.pregnancy_caution && (input.pregnant ?? "").toLowerCase() === "yes") {
      out.push({
        code: "pregnancy_caution",
        severity: "danger",
        message: `${rule.ingredient} is not recommended during pregnancy.`,
        recommendation: rule.notes || "Avoid unless prescribed by your provider.",
      });
    }

    // --- Liver/kidney cautions ---
    if (rule.liver_disease_caution && includesAny(conds, ["liver", "hepatitis", "cirrhosis"])) {
      out.push({
        code: "liver_caution",
        severity: "warning",
        message: `${rule.ingredient} may pose risk for individuals with liver disease.`,
        recommendation: rule.notes || "Use with caution or avoid.",
      });
    }
    if (rule.kidney_disease_caution && includesAny(conds, ["renal", "kidney"])) {
      out.push({
        code: "kidney_caution",
        severity: "warning",
        message: `${rule.ingredient} may increase kidney workload or stone risk.`,
        recommendation: rule.notes || "Stay hydrated and monitor function.",
      });
    }

    // --- Immunocompromised caution ---
    if (rule.immunocompromised_caution && includesAny(conds, ["autoimmune", "immuno", "infection"])) {
      out.push({
        code: "immunocompromised_caution",
        severity: "warning",
        message: `${rule.ingredient} may not be appropriate for immunocompromised users.`,
        recommendation: rule.notes || "Consult your clinician before use.",
      });
    }

    // --- Caffeine stimulant caution ---
    if (rule.caffeine_stimulant_caution && includesAny(supps, ["caffeine", "guarana", "yerba"])) {
      out.push({
        code: "caffeine_stimulant",
        severity: "info",
        message: `${rule.ingredient} has stimulant properties that can worsen anxiety or insomnia.`,
        recommendation: rule.notes || "Take early in the day.",
      });
    }
  }

  return out;
}
