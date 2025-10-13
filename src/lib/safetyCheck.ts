// -----------------------------------------------------------------------------
// File: lib/safetyCheck.ts
// LVE360 — Hybrid Safety Engine (Interactions + Rules + Static Fallback)
// Updated: 2025-10-13
//
// Purpose:
//   Evaluate supplement safety using three layers:
//     1️⃣ Supabase interactions table  → structured pharmacological risks
//     2️⃣ Supabase rules table         → custom best-practice cautions
//     3️⃣ Static fallback rules        → in-code backup if DB unavailable
//
// Returns an array of structured SafetyWarnings ready for dashboard display.
//
// -----------------------------------------------------------------------------

import { supabaseAdmin as supa } from "@/lib/supabaseAdmin";

// -----------------------------
// Types
// -----------------------------
export type SafetySeverity = "info" | "warning" | "danger";

export interface SafetyWarning {
  item: string;
  caution: string;
  severity: SafetySeverity;
  source: "interactions" | "rules" | "static";
  note?: string | null;
}

// -----------------------------
// Static fallback rules (only used if DB fetch fails)
// -----------------------------
const STATIC_RULES: SafetyWarning[] = [
  {
    item: "Zinc",
    caution: "Separate from thyroid medication by at least 4 hours.",
    severity: "warning",
    source: "static",
  },
  {
    item: "Garlic",
    caution: "May increase bleeding risk when combined with anticoagulants.",
    severity: "danger",
    source: "static",
  },
  {
    item: "Omega-3",
    caution: "High doses may increase bleeding risk with anticoagulants.",
    severity: "warning",
    source: "static",
  },
  {
    item: "Ashwagandha",
    caution: "Avoid during pregnancy.",
    severity: "warning",
    source: "static",
  },
  {
    item: "Green Tea",
    caution: "Can reduce absorption of some medications if taken together.",
    severity: "info",
    source: "static",
  },
];

// -----------------------------
// Utility helpers
// -----------------------------
function normalize(str: string | null | undefined): string {
  return (str ?? "").toLowerCase().trim();
}

function matchesAny(target: string, candidates: string[]): boolean {
  const lowerTarget = normalize(target);
  return candidates.some(c => lowerTarget.includes(normalize(c)));
}

// -----------------------------
// Main safety evaluation
// -----------------------------
export async function evaluateSafety(input: {
  medications?: string[];
  supplements?: string[];
  conditions?: string[];
  pregnant?: string | null;
}): Promise<SafetyWarning[]> {
  const { medications = [], supplements = [], conditions = [], pregnant } = input;
  const warnings: SafetyWarning[] = [];

  try {
    // -------------------------------------------------------------------------
    // 1️⃣ Pull data from Supabase
    // -------------------------------------------------------------------------
    const [interactionsRes, rulesRes] = await Promise.all([
      supa.from("interactions").select("*"),
      supa.from("rules").select("*"),
    ]);

    const interactions = interactionsRes.data ?? [];
    const rules = rulesRes.data ?? [];

    // -------------------------------------------------------------------------
    // 2️⃣ Evaluate Interactions Table (structured risk flags)
    // -------------------------------------------------------------------------
    for (const supp of supplements) {
      const match = interactions.find(
        (i: any) => normalize(i.ingredient) === normalize(supp)
      );
      if (!match) continue;

      // Thyroid meds
      if (match.binds_thyroid_meds && medications.some(m => normalize(m).includes("thyroid"))) {
        warnings.push({
          item: supp,
          caution: `Separate from thyroid medication by ${match.sep_hours_thyroid || 4} hours.`,
          severity: "warning",
          source: "interactions",
        });
      }

      // Anticoagulants
      if (match.anticoagulants_bleeding_risk && medications.some(m => normalize(m).includes("warfarin") || normalize(m).includes("anticoagulant"))) {
        warnings.push({
          item: supp,
          caution: "May increase bleeding risk when combined with anticoagulants.",
          severity: "danger",
          source: "interactions",
        });
      }

      // Diabetes meds
      if (match.diabetes_meds_additive_risk && medications.some(m => normalize(m).includes("metformin") || normalize(m).includes("insulin"))) {
        warnings.push({
          item: supp,
          caution: "May enhance blood sugar–lowering effect; monitor glucose closely.",
          severity: "warning",
          source: "interactions",
        });
      }

      // Liver/kidney cautions
      if (match.liver_caution) {
        warnings.push({
          item: supp,
          caution: "Use cautiously with liver impairment.",
          severity: "warning",
          source: "interactions",
        });
      }
      if (match.kidney_caution) {
        warnings.push({
          item: supp,
          caution: "Use cautiously with kidney impairment.",
          severity: "warning",
          source: "interactions",
        });
      }

      // Pregnancy caution
      if (pregnant && match.pregnancy_caution) {
        warnings.push({
          item: supp,
          caution: "Not recommended during pregnancy.",
          severity: "warning",
          source: "interactions",
        });
      }
    }

    // -------------------------------------------------------------------------
    // 3️⃣ Evaluate Rules Table (custom free-text cautions)
    // -------------------------------------------------------------------------
    for (const rule of rules) {
      const trigger = normalize(rule.trigger);
      const matchedSupp = supplements.find(s => normalize(s).includes(trigger));
      if (matchedSupp) {
        warnings.push({
          item: matchedSupp,
          caution: rule.caution || "Caution advised.",
          severity: (rule.severity || "warning").toLowerCase() as SafetySeverity,
          source: "rules",
          note: rule.notes || null,
        });
      }
    }

    // -------------------------------------------------------------------------
    // 4️⃣ Deduplicate by supplement + caution text
    // -------------------------------------------------------------------------
    const unique: Record<string, SafetyWarning> = {};
    for (const w of warnings) {
      const key = `${normalize(w.item)}::${normalize(w.caution)}`;
      if (!unique[key]) unique[key] = w;
    }

    const deduped = Object.values(unique);

    // -------------------------------------------------------------------------
    // 5️⃣ Return results (or fallback)
    // -------------------------------------------------------------------------
    return deduped.length > 0 ? deduped : [
      {
        item: "All clear",
        caution: "No safety issues detected.",
        severity: "info",
        source: "interactions",
      },
    ];
  } catch (err) {
    console.error("Safety evaluation failed; fallback to static:", err);

    // -------------------------------------------------------------------------
    // 6️⃣ Fallback mode (DB unavailable)
    // -------------------------------------------------------------------------
    return STATIC_RULES;
  }
}
