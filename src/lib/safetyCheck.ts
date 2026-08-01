import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  evaluateSafetyCandidates,
  unavailableSafetyEvaluation,
  type InteractionRow,
  type SafetyCandidate,
  type SafetyContext,
  type SafetyEvaluation,
  type SafetyFinding,
  type SafetyRuleRow,
} from "@/lib/safetyEngine";

type SafetyItem = SafetyCandidate & {
  caution?: string | null;
};

export interface AppliedSafetyResult extends SafetyEvaluation {
  cleaned: SafetyItem[];
}

const INTERACTION_COLUMNS = [
  "ingredient",
  "binds_thyroid_meds",
  "sep_hours_thyroid",
  "anticoagulants_bleeding_risk",
  "diabetes_meds_additive",
  "sedatives_additive",
  "antibiotics_interaction",
  "pregnancy_caution",
  "liver_disease_caution",
  "kidney_disease_caution",
  "immunocompromised_caution",
  "caffeine_stimulant_caution",
  "liver_caution",
  "kidney_caution",
  "notes",
].join(",");

const RULE_COLUMNS = [
  "rule_id",
  "rule_type",
  "action",
  "entity_a_name",
  "max_daily_amount",
  "unit",
  "message",
  "source_url",
  "trigger_name",
  "severity",
  "notes",
  "caution",
].join(",");

function applyFindingsToItems(items: SafetyItem[], evaluation: SafetyEvaluation): SafetyItem[] {
  const resultByName = new Map(evaluation.candidates.map((candidate) => [candidate.name.toLowerCase().trim(), candidate]));
  return items.map((item) => {
    const result = resultByName.get(item.name.toLowerCase().trim());
    if (!result?.findings.length) return item;
    const safetyCaution = Array.from(new Set(result.findings.map((finding) => finding.message))).join(" ");
    return {
      ...item,
      caution: [item.caution, safetyCaution].filter(Boolean).join(" "),
    };
  });
}

async function loadSafetySources(): Promise<{ interactions: InteractionRow[]; rules: SafetyRuleRow[] }> {
  const [interactionsResult, rulesResult] = await Promise.all([
    supabaseAdmin.from("interactions").select(INTERACTION_COLUMNS),
    supabaseAdmin.from("rules").select(RULE_COLUMNS),
  ]);
  if (interactionsResult.error) throw new Error(`Interactions query failed: ${interactionsResult.error.message}`);
  if (rulesResult.error) throw new Error(`Rules query failed: ${rulesResult.error.message}`);
  return {
    interactions: (interactionsResult.data ?? []) as unknown as InteractionRow[],
    rules: (rulesResult.data ?? []) as unknown as SafetyRuleRow[],
  };
}

export async function applySafetyChecks(context: SafetyContext, items: SafetyItem[]): Promise<AppliedSafetyResult> {
  let evaluation: SafetyEvaluation;
  try {
    evaluation = evaluateSafetyCandidates(context, items, await loadSafetySources());
  } catch (error) {
    console.error("Safety evaluation failed closed", error);
    evaluation = unavailableSafetyEvaluation(items);
  }
  return {
    ...evaluation,
    cleaned: applyFindingsToItems(items, evaluation),
  };
}

/** Compatibility adapter for older callers that only need warning rows. */
export async function evaluateSafety(input: SafetyContext & { supplements?: string[] }): Promise<SafetyFinding[]> {
  const result = await applySafetyChecks(
    input,
    (input.supplements ?? []).map((name) => ({ name, is_current: false }))
  );
  return result.findings;
}
