import "server-only";

import { createHash } from "node:crypto";

import {
  buildNormalizedCurrentStackLedger,
  type NormalizedCurrentStackLedgerItem,
} from "@/lib/normalizedCurrentStackLedger";
import {
  isEndocrineActiveSupplementName,
  isEligibleSupplementName,
  isMedicationOrHormoneName,
} from "@/lib/supplementEligibility";

export const MAX_MEMBER_SUPPLEMENTS = 30;
export const MEMBER_SUPPLEMENT_OVERRIDE_KEY = "member_current_supplements";
// Increment only when a report or safety-engine change requires members to
// regenerate an otherwise unchanged Blueprint.
export const BLUEPRINT_ENGINE_VERSION = "2026-08-09.3";

export type MemberSupplement = {
  id: string;
  name: string;
  brand: string | null;
  dose: string | null;
  timing: string | null;
  active: boolean;
};

type SubmissionInput = {
  engine_input_json?: unknown;
  answers?: unknown;
  payload_json?: unknown;
  [key: string]: unknown;
};

function asObject(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : {};
    } catch {
      return {};
    }
  }
  return typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function cleanOptionalText(value: unknown, maxLength: number): string | null {
  if (value == null) return null;
  const cleaned = String(value).replace(/\s+/g, " ").trim();
  return cleaned ? cleaned.slice(0, maxLength) : null;
}

function supplementId(value: unknown, index: number): string {
  const candidate = cleanOptionalText(value, 80);
  return candidate && /^[a-zA-Z0-9:_-]+$/.test(candidate)
    ? candidate
    : `member:${index}:${crypto.randomUUID()}`;
}

export function normalizeMemberSupplements(value: unknown): MemberSupplement[] {
  if (!Array.isArray(value)) throw new Error("supplements_must_be_an_array");
  if (value.length > MAX_MEMBER_SUPPLEMENTS) throw new Error("too_many_supplements");

  const seen = new Set<string>();
  return value.map((raw, index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error("invalid_supplement");
    }
    const item = raw as Record<string, unknown>;
    const name = cleanOptionalText(item.name, 120);
    const endocrineActive = isEndocrineActiveSupplementName(name);
    if (
      !name ||
      (!isEligibleSupplementName(name) && !endocrineActive) ||
      (isMedicationOrHormoneName(name) && !endocrineActive)
    ) {
      throw new Error("invalid_supplement_name");
    }
    const duplicateKey = name.toLowerCase();
    if (seen.has(duplicateKey)) throw new Error("duplicate_supplement");
    seen.add(duplicateKey);

    return {
      id: supplementId(item.id, index),
      name,
      brand: cleanOptionalText(item.brand, 120),
      dose: cleanOptionalText(item.dose, 120),
      timing: cleanOptionalText(item.timing, 160),
      active: item.active !== false,
    };
  });
}

function supplementFromLedger(
  item: NormalizedCurrentStackLedgerItem,
  index: number
): MemberSupplement {
  return {
    id: `intake:${index}:${createHash("sha1").update(item.name.toLowerCase()).digest("hex").slice(0, 12)}`,
    name: item.name,
    brand: null,
    dose: item.dose ?? null,
    timing: item.timing ?? null,
    active: true,
  };
}

export function getMemberSupplements(submission: SubmissionInput): {
  supplements: MemberSupplement[];
  hasOverride: boolean;
} {
  const engine = asObject(submission.engine_input_json);
  if (Array.isArray(engine[MEMBER_SUPPLEMENT_OVERRIDE_KEY])) {
    return {
      supplements: normalizeMemberSupplements(engine[MEMBER_SUPPLEMENT_OVERRIDE_KEY]),
      hasOverride: true,
    };
  }

  const supplements = buildNormalizedCurrentStackLedger(submission)
    .filter((item) => item.kind === "supplement" || item.kind === "endocrine_active_supplement")
    .map(supplementFromLedger);
  return { supplements, hasOverride: false };
}

export function withMemberSupplementOverride(
  submission: SubmissionInput,
  supplements: MemberSupplement[]
): Record<string, unknown> {
  const engine = asObject(submission.engine_input_json);
  return {
    ...engine,
    [MEMBER_SUPPLEMENT_OVERRIDE_KEY]: supplements,
    member_current_supplements_updated_at: new Date().toISOString(),
  };
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== "member_current_supplements_updated_at")
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, stableValue(nested)])
  );
}

export function blueprintInputSnapshotHash(
  submission: SubmissionInput,
  canonicalRegimen?: unknown
): string {
  const engine = asObject(submission.engine_input_json);
  const submissionSource = Object.keys(engine).length > 0
    ? { engine_input_json: engine }
    : {
        answers: submission.answers ?? null,
        payload_json: submission.payload_json ?? null,
      };
  const source = typeof canonicalRegimen === "undefined"
    ? { ...submissionSource, blueprint_engine_version: BLUEPRINT_ENGINE_VERSION }
    : {
        ...submissionSource,
        canonical_current_regimen: canonicalRegimen,
        blueprint_engine_version: BLUEPRINT_ENGINE_VERSION,
      };
  return createHash("sha256")
    .update(JSON.stringify(stableValue(source)))
    .digest("hex");
}
