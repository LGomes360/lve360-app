export const MEDICATION_INSTRUCTION_AUTHORITIES = [
  "clinician",
  "pharmacist",
  "medication_label",
] as const;

export type MedicationInstructionAuthority = (typeof MEDICATION_INSTRUCTION_AUTHORITIES)[number];

export const MEDICATION_AUTHORITY_LABELS: Record<MedicationInstructionAuthority, string> = {
  clinician: "My clinician or prescriber",
  pharmacist: "My pharmacist",
  medication_label: "My current medication label",
};

export function isMedicationInstructionAuthority(value: unknown): value is MedicationInstructionAuthority {
  return typeof value === "string"
    && MEDICATION_INSTRUCTION_AUTHORITIES.includes(value as MedicationInstructionAuthority);
}

function clean(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\s+/g, " ").trim().slice(0, maxLength);
  return normalized || null;
}

export function normalizeMedicationRecordInput(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("invalid_medication_record");
  }
  const input = value as Record<string, unknown>;
  const name = clean(input.name, 120);
  if (!name || name.length < 2) throw new Error("medication_name_required");
  if (!isMedicationInstructionAuthority(input.instruction_authority)) {
    throw new Error("medication_instruction_source_required");
  }
  return {
    name,
    dose: clean(input.dose, 120),
    timing: clean(input.timing, 160),
    purpose: clean(input.purpose, 200),
    instruction_authority: input.instruction_authority,
  };
}
