import { normalizeRegimenSchedule } from "./regimenSchedule.ts";

export const MEDICATION_INSTRUCTION_AUTHORITIES = [
  "clinician",
  "pharmacist",
  "medication_label",
] as const;

export type MedicationInstructionAuthority = (typeof MEDICATION_INSTRUCTION_AUTHORITIES)[number];

export const REGIMEN_INSTRUCTION_AUTHORITIES = [
  ...MEDICATION_INSTRUCTION_AUTHORITIES,
  "product_label",
] as const;

export type RegimenInstructionAuthority = (typeof REGIMEN_INSTRUCTION_AUTHORITIES)[number];

export const MEDICATION_AUTHORITY_LABELS: Record<MedicationInstructionAuthority, string> = {
  clinician: "My clinician or prescriber",
  pharmacist: "My pharmacist",
  medication_label: "My current prescription label",
};

export const REGIMEN_AUTHORITY_LABELS: Record<RegimenInstructionAuthority, string> = {
  ...MEDICATION_AUTHORITY_LABELS,
  product_label: "My current product label",
};

export function isMedicationInstructionAuthority(value: unknown): value is MedicationInstructionAuthority {
  return typeof value === "string"
    && MEDICATION_INSTRUCTION_AUTHORITIES.includes(value as MedicationInstructionAuthority);
}

export function isRegimenInstructionAuthority(value: unknown): value is RegimenInstructionAuthority {
  return typeof value === "string"
    && REGIMEN_INSTRUCTION_AUTHORITIES.includes(value as RegimenInstructionAuthority);
}

function clean(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\s+/g, " ").trim().slice(0, maxLength);
  return normalized || null;
}

export function normalizeMedicationRecordInput(value: unknown) {
  return normalizePrescribedRecordInput(value, "medication");
}

export function normalizeHormoneRecordInput(value: unknown) {
  return normalizePrescribedRecordInput(value, "hormone");
}

function normalizePrescribedRecordInput(value: unknown, kind: "medication" | "hormone") {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`invalid_${kind}_record`);
  }
  const input = value as Record<string, unknown>;
  const name = clean(input.name, 120);
  if (!name || name.length < 2) throw new Error(`${kind}_name_required`);
  if (!isMedicationInstructionAuthority(input.instruction_authority)) {
    throw new Error(`${kind}_instruction_source_required`);
  }
  return {
    name,
    dose: clean(input.dose, 120),
    timing: clean(input.timing, 160),
    purpose: clean(input.purpose, 200),
    instruction_authority: input.instruction_authority,
    ...(typeof input.schedule !== "undefined" ? { schedule: normalizeRegimenSchedule(input.schedule) } : {}),
  };
}
