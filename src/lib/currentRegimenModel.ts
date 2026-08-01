import type { NormalizedCurrentStackLedgerItem } from "@/lib/normalizedCurrentStackLedger";
import { isEndocrineActiveSupplementName } from "@/lib/supplementEligibility";
import type { MedicationInstructionAuthority } from "@/lib/medicationRecord";

export type CurrentRegimenKind = NormalizedCurrentStackLedgerItem["kind"];
export type CurrentRegimenSource = "intake" | "member_update" | "adopted_recommendation" | "manual_add";

export type CurrentRegimenItem = {
  id: string;
  user_id: string;
  source_submission_id: string | null;
  source_stack_item_id: string | null;
  item_kind: CurrentRegimenKind;
  name: string;
  normalized_name: string;
  purpose: string | null;
  dose: string | null;
  timing: string | null;
  instruction_source: CurrentRegimenSource;
  instruction_authority: MedicationInstructionAuthority | null;
  active: boolean;
  created_at?: string;
  updated_at?: string;
};

export function normalizeRegimenName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

export function regimenKindForSupplement(name: string): CurrentRegimenKind {
  return isEndocrineActiveSupplementName(name) ? "endocrine_active_supplement" : "supplement";
}

export function ledgerToRegimenRows(
  ledger: NormalizedCurrentStackLedgerItem[],
  userId: string,
  submissionId: string,
  source: CurrentRegimenSource = "intake"
) {
  return ledger.map((item) => ({
    user_id: userId,
    source_submission_id: submissionId,
    source_stack_item_id: null,
    item_kind: item.kind,
    name: item.name,
    normalized_name: normalizeRegimenName(item.name),
    purpose: item.purpose ?? null,
    dose: item.dose ?? null,
    timing: item.timing ?? null,
    instruction_source: source,
    active: true,
    updated_at: new Date().toISOString(),
  }));
}

export function regimenToLedger(items: CurrentRegimenItem[]): NormalizedCurrentStackLedgerItem[] {
  return items.filter((item) => item.active)
    .sort((left, right) =>
      left.item_kind.localeCompare(right.item_kind) ||
      left.normalized_name.localeCompare(right.normalized_name)
    )
    .map((item) => ({
    name: item.name,
    kind: item.item_kind,
    ...(item.purpose ? { purpose: item.purpose } : {}),
    ...(item.dose ? { dose: item.dose } : {}),
    ...(item.timing ? { timing: item.timing } : {}),
    source_paths: [`current_regimen_items.${item.id}`, `instruction_source.${item.instruction_source}`],
    raw_labels: [item.instruction_source, item.instruction_authority].filter(Boolean) as string[],
  }));
}
