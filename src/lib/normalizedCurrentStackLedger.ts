import { isPreferenceFieldOrValue } from "./supplementEligibility";

export type CurrentStackKind = "medication" | "supplement" | "hormone" | "endocrine_active_supplement";

export type NormalizedCurrentStackLedgerItem = {
  name: string;
  kind: CurrentStackKind;
  purpose?: string;
  dose?: string;
  timing?: string;
  source_paths: string[];
  raw_labels: string[];
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INVALID_NAME_RE = /^(?:\[object Object\]|tbd|none|null|no|n\/?a|blank|each|no (?:medications?|supplements?|hormones?)|not reported)$/i;
const KIND_PATTERNS: Array<[CurrentStackKind, RegExp]> = [
  ["hormone", /\b(?:hormones?|trt|testosterone|dhea|pregnenolone)\b/i],
  ["medication", /\b(?:medications?|prescriptions?|drugs?|glp(?:[ -]?1)?|thyroid)\b/i],
  ["supplement", /\b(?:supplements?|vitamins?|current[ _-]?stack)\b/i],
];
const DETAIL_KEYS = new Set(["dose", "dosage", "amount", "timing", "frequency", "schedule", "purpose", "notes"]);
const METADATA_KEYS = new Set(["id", "key", "type", "options", "submission_id", "field_id", "created_at", "updated_at"]);
const DETAIL_LABEL_RE = /\b(?:purpose|dose|dosage|frequency|timing|how often|when taken)\b/i;
const YES_NO_RE = /^(?:yes|no|true|false)$/i;
const ENDOCRINE_ACTIVE_RE = /^(?:dhea|pregnenolone)\b/i;
const INLINE_DOSE_RE = /\b\d+(?:\.\d+)?\s*(?:mcg|\u00b5g|ug|mg|g|iu|ml)\b|\b\d+(?:\.\d+)?\s*%/i;
const INLINE_FREQUENCY_RE = /\b(?:(?:once|twice|three times|\d+\s*x)\s*(?:(?:a|per)\s+)?(?:day|daily)?|daily|nightly|weekly|monthly|every other day)\b/i;
const DOSE_ONLY_RE = /^\d+(?:\.\d+)?\s*(?:mcg|\u00b5g|ug|mg|g|iu|ml|%)(?:\s*(?:daily|nightly|morning|evening|night|am|pm|weekly|monthly|twice daily))?$/i;
const DANGLING_DASH_RE = /(?:\u2014|\u2013|â€”|â€“|-|\?)\s*$/;

function normalizeNumericCommas(value: string): string {
  return value.replace(/(\d),(?=\d{3}\b)/g, "$1");
}

function cleanParsedName(value: string): string {
  const cleaned = value
    .replace(/\s*(?:\u2014|\u2013|â€”|â€“|-)\s*$/g, "")
    .replace(/\s*\?\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (/^(?:alcar|acetyl[- ]l[- ]carnitine(?:\s*\(alcar\))?)$/i.test(cleaned)) {
    return "Acetyl-L-carnitine (ALCAR)";
  }
  if (/^(?:omega(?:[- ]?3)?|fish oil)$/i.test(cleaned)) return "Omega-3";
  return cleaned;
}

export function isMalformedCurrentStackName(value: unknown): boolean {
  const name = String(value ?? "").replace(/\s+/g, " ").trim();
  return !name || INVALID_NAME_RE.test(name) || UUID_RE.test(name) || DANGLING_DASH_RE.test(name) ||
    /^\d+$/.test(name) || /^0{2,}\s*(?:mg|mcg|g|iu|ml)\b/i.test(name) || DOSE_ONLY_RE.test(name);
}

export function classifyCurrentStackKind(name: string, fallback: CurrentStackKind): CurrentStackKind {
  return ENDOCRINE_ACTIVE_RE.test(name.trim()) ? "endocrine_active_supplement" : fallback;
}

export function currentStackKindLabel(kind: CurrentStackKind): string {
  if (kind === "endocrine_active_supplement") return "Hormone-active supplement";
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

export function parseCurrentStackFreeText(raw: string): {
  name: string;
  dose?: string;
  timing?: string;
  purpose?: string;
} {
  const original = normalizeNumericCommas(raw).replace(/\s+/g, " ").trim();
  const dose = original.match(INLINE_DOSE_RE)?.[0]?.trim();
  const purposeMatch = original.match(/\bfor\s+([^,;]+)$/i);
  const purpose = purposeMatch?.[1]?.trim();
  const timingParts: string[] = [];
  const timeOfDay = original.match(/\b(?:morning|evening|night|nightly|bedtime|am|pm)\b/i)?.[0];
  const frequency = original.match(INLINE_FREQUENCY_RE)?.[0];
  const withFood = original.match(/\bwith\s+(?:breakfast|lunch|dinner|meals?|food)\b/i)?.[0];
  const asNeeded = /\bas needed\b/i.test(original) ? "As needed" : undefined;
  for (const part of [timeOfDay, frequency, withFood, asNeeded]) {
    if (part && !timingParts.some((existing) => existing.toLowerCase() === part.toLowerCase())) timingParts.push(part);
  }

  let name = original;
  if (purposeMatch) name = name.replace(purposeMatch[0], " ");
  if (dose) name = name.replace(dose, " ");
  name = name
    .replace(/\bat\s+(?:morning|evening|night|nightly|bedtime)\b/gi, " ")
    .replace(/\b(?:morning|evening|night|nightly|bedtime|am|pm)\b/gi, " ")
    .replace(new RegExp(INLINE_FREQUENCY_RE.source, "gi"), " ")
    .replace(/\bwith\s+(?:breakfast|lunch|dinner|meals?|food)\b/gi, " ")
    .replace(/\bas needed\b/gi, " ")
    .replace(/\s+/g, " ")
    .replace(/[,:;]+$/g, "")
    .trim();
  name = cleanParsedName(name);

  return {
    name: name || original,
    ...(dose ? { dose } : {}),
    ...(timingParts.length ? { timing: timingParts.map((part) => part.replace(/^./, (c) => c.toUpperCase())).join("; ") } : {}),
    ...(purpose ? { purpose: purpose.replace(/^./, (c) => c.toUpperCase()) } : {}),
  };
}

function parseJson(value: unknown): any {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed || !/^[\[{]/.test(trimmed)) return value;
  try { return JSON.parse(trimmed); } catch { return value; }
}

function readableText(value: unknown): string | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const text = normalizeNumericCommas(String(value)).replace(/\s+/g, " ").trim();
  return text && !isMalformedCurrentStackName(text) ? text : undefined;
}

export function extractLedgerReadableNames(
  raw: unknown,
  seen: WeakSet<object> = new WeakSet(),
  depth = 0
): string[] {
  const value = parseJson(raw);
  if (value == null || depth > 12) return [];
  if (typeof value === "string") {
    return normalizeNumericCommas(value).split(/,|\n|;|\|/).map(readableText).filter((name): name is string => Boolean(name));
  }
  if (typeof value !== "object") return [];
  if (seen.has(value)) return [];
  seen.add(value);
  if (Array.isArray(value)) return value.flatMap((item) => extractLedgerReadableNames(item, seen, depth + 1));

  const object = value as Record<string, any>;
  const named = [
    object.med_name, object.medication_name, object.supplement_name, object.hormone_name,
    object.name, object.label, object.text, object.title,
  ].filter((candidate) => candidate != null);
  const nestedAnswers = [
    object.selectedOptions, object.choices?.labels, object.choices,
    object.value, object.answer, object.choice,
  ].filter((candidate) => candidate != null);
  let names = [...named, ...nestedAnswers].flatMap((candidate) =>
    extractLedgerReadableNames(candidate, seen, depth + 1)
  );
  if (!names.length) {
    names = Object.entries(object)
      .filter(([key]) => !DETAIL_KEYS.has(key.toLowerCase()) && !METADATA_KEYS.has(key.toLowerCase()))
      .flatMap(([, nested]) => extractLedgerReadableNames(nested, seen, depth + 1));
  }
  const unique = new Map<string, string>();
  for (const name of names) if (!unique.has(name.toLowerCase())) unique.set(name.toLowerCase(), name);
  return Array.from(unique.values());
}

function inferKind(labelOrKey: string): CurrentStackKind | null {
  const readable = labelOrKey.replace(/[_-]+/g, " ");
  for (const [kind, pattern] of KIND_PATTERNS) if (pattern.test(readable)) return kind;
  return null;
}

function detailFrom(value: unknown): string | undefined {
  const parsed = parseJson(value);
  if (typeof parsed === "string" || typeof parsed === "number") {
    const detail = normalizeNumericCommas(String(parsed)).replace(/\s+/g, " ").trim();
    return detail && !UUID_RE.test(detail) && !INVALID_NAME_RE.test(detail) ? detail : undefined;
  }
  return extractLedgerReadableNames(parsed)[0];
}

function fieldValues(field: Record<string, any>): unknown[] {
  const options = field.options ?? field.field?.options ?? [];
  const optionLabels = new Map<string, string>();
  for (const option of Array.isArray(options) ? options : []) {
    const id = option?.id ?? option?.value;
    const label = option?.text ?? option?.label ?? option?.name;
    if (id != null && readableText(label)) optionLabels.set(String(id), String(label));
  }
  const resolve = (value: any): any => {
    if (Array.isArray(value)) return value.map(resolve);
    if (typeof value === "string" && optionLabels.has(value)) return optionLabels.get(value);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, resolve(nested)]));
  };
  return [
    field.text, field.choice, field.choices, field.selectedOptions, field.value, field.answer,
  ].filter((value) => value != null).map(resolve);
}

function fieldLabel(field: Record<string, any>): string {
  return String(
    field.label ?? field.field?.label ?? field.title ?? field.question ??
    field.key ?? field.field?.key ?? field.field?.id ?? ""
  ).replace(/\s+/g, " ").trim();
}

function repeatedItemKind(label: string, activeKind: CurrentStackKind | null): CurrentStackKind | null {
  const normalized = label.replace(/[–—]/g, "-").replace(/\s+/g, " ").trim();
  if (/^list medications?$/i.test(normalized) || /^medication\s+(?:[2-6]|others?)(?:\s*\/.*)?$/i.test(normalized))
    return "medication";
  if (/^list supplements?$/i.test(normalized) || /^supplement\s+(?:[2-6]|others?)(?:\s*\/.*)?$/i.test(normalized))
    return "supplement";
  if (/^list hormones?$/i.test(normalized) || /^hormone\s+(?:[2-6]|others?)(?:\s*\/.*)?$/i.test(normalized))
    return "hormone";
  if (/^others?$/i.test(normalized)) return activeKind;
  return null;
}

function fieldDetail(field: Record<string, any>): string | undefined {
  for (const value of fieldValues(field)) {
    if (typeof value === "string" || typeof value === "number") {
      const detail = String(value).replace(/\s+/g, " ").trim();
      if (detail && !UUID_RE.test(detail) && !INVALID_NAME_RE.test(detail)) return detail;
    }
    const names = extractLedgerReadableNames(value).filter((name) => !YES_NO_RE.test(name));
    if (names.length) return names.join(", ");
  }
  return undefined;
}

type DetailRole = "purpose" | "dose" | "timing";

function detailRoleForLabel(label: string): DetailRole | null {
  const normalized = normalizeNumericCommas(label).replace(/\s+/g, " ").trim();
  if (/\bpurpose\b/i.test(normalized) || /^e\.?g\.?,?\s*(?!\d)/i.test(normalized)) return "purpose";
  if (/\b(?:dose|dosage|amount|strength)\b/i.test(normalized) || INLINE_DOSE_RE.test(normalized)) return "dose";
  if (/\b(?:frequency|timing|how often|when taken|schedule)\b/i.test(normalized) ||
      INLINE_FREQUENCY_RE.test(normalized) || /\b(?:am|pm|morning|evening|bedtime)\b/i.test(normalized)) return "timing";
  return null;
}

export function parseTallyCurrentStackFields(
  fields: unknown,
  sourcePath = "fields"
): NormalizedCurrentStackLedgerItem[] {
  if (!Array.isArray(fields)) return [];
  const parsed: NormalizedCurrentStackLedgerItem[] = [];
  let activeKind: CurrentStackKind | null = null;
  let currentItems: NormalizedCurrentStackLedgerItem[] = [];

  fields.forEach((rawField, index) => {
    if (!rawField || typeof rawField !== "object") return;
    const field = rawField as Record<string, any>;
    const label = fieldLabel(field);
    if (!label || isPreferenceFieldOrValue(label)) return;

    const detailRole = detailRoleForLabel(label);
    if (detailRole) {
      if (!currentItems.length) return;
      const detail = fieldDetail(field);
      if (!detail) return;
      for (const currentItem of currentItems) {
        if (detailRole === "purpose") {
          currentItem.purpose = currentItem.purpose ?? detail;
        } else if (detailRole === "dose") {
          currentItem.dose = currentItem.dose ?? detail;
        } else {
          currentItem.timing = currentItem.timing ?? detail;
        }
        currentItem.source_paths.push(`${sourcePath}[${index}]`);
      }
      return;
    }

    const kind = repeatedItemKind(label, activeKind);
    if (!kind) return;
    activeKind = kind;
    const names = fieldValues(field)
      .flatMap((value) => extractLedgerReadableNames(value))
      .filter((name) => !isPreferenceFieldOrValue(name) && !YES_NO_RE.test(name) && !isMalformedCurrentStackName(name));
    currentItems = [];
    for (const rawName of names) {
      const parsedValue = parseCurrentStackFreeText(rawName);
      if (isMalformedCurrentStackName(parsedValue.name)) continue;
      const item: NormalizedCurrentStackLedgerItem = {
        name: parsedValue.name,
        kind: classifyCurrentStackKind(parsedValue.name, kind),
        ...(parsedValue.purpose ? { purpose: parsedValue.purpose } : {}),
        ...(parsedValue.dose ? { dose: parsedValue.dose } : {}),
        ...(parsedValue.timing ? { timing: parsedValue.timing } : {}),
        source_paths: [`${sourcePath}[${index}]`],
        raw_labels: [label],
      };
      parsed.push(item);
      currentItems.push(item);
    }
  });

  return parsed;
}

function tallyFieldCollections(submission: any): Array<{ fields: unknown; path: string }> {
  const payload = parseJson(submission?.payload_json) ?? {};
  const answers = parseJson(submission?.answers) ?? [];
  return [
    { fields: payload?.data?.fields, path: "payload_json.data.fields" },
    { fields: payload?.form_response?.answers, path: "payload_json.form_response.answers" },
    { fields: answers, path: "answers" },
    { fields: answers?.data?.fields, path: "answers.data.fields" },
  ].filter((entry) => Array.isArray(entry.fields));
}

export function findMissingRepeatedTallyItems(
  submission: any,
  ledger: NormalizedCurrentStackLedgerItem[]
): string[] {
  const ledgerKeys = new Set(ledger.map((item) => `${item.kind}:${item.name.toLowerCase()}`));
  const missing = tallyFieldCollections(submission)
    .flatMap(({ fields, path }) => parseTallyCurrentStackFields(fields, path))
    .filter((item) => item.raw_labels.some((label) =>
      /^(?:medication|supplement|hormone)\s+(?:[2-6]|others?)(?:\s*\/.*)?$/i.test(label) || /^others?$/i.test(label)
    ))
    .filter((item) => !ledgerKeys.has(`${item.kind}:${item.name.toLowerCase()}`))
    .map((item) => `${item.kind}:${item.name}`);
  return Array.from(new Set(missing));
}

export function buildNormalizedCurrentStackLedger(submission: any): NormalizedCurrentStackLedgerItem[] {
  const ledger = new Map<string, NormalizedCurrentStackLedgerItem>();
  const addValue = (kind: CurrentStackKind, raw: unknown, sourcePath: string, rawLabel?: string) => {
    const parsed = parseJson(raw);
    const parts = Array.isArray(parsed) ? parsed : [parsed];
    for (const part of parts) {
      const names = extractLedgerReadableNames(part);
      for (const rawName of names) {
        if (!rawName || isPreferenceFieldOrValue(rawLabel) || isPreferenceFieldOrValue(rawName) || YES_NO_RE.test(rawName) || isMalformedCurrentStackName(rawName)) continue;
        const parsedValue = parseCurrentStackFreeText(rawName);
        if (isMalformedCurrentStackName(parsedValue.name)) continue;
        const resolvedKind = classifyCurrentStackKind(parsedValue.name, kind);
        const key = `${resolvedKind}:${parsedValue.name.toLowerCase()}`;
        const object = part && typeof part === "object" && !Array.isArray(part) ? part as Record<string, any> : {};
        const nextDose = detailFrom(object.dose ?? object.dosage ?? object.amount) ?? parsedValue.dose;
        const nextTiming = detailFrom(object.timing ?? object.frequency ?? object.schedule) ?? parsedValue.timing;
        const nextPurpose = detailFrom(object.purpose ?? object.notes) ?? parsedValue.purpose;
        const existing = ledger.get(key);
        if (existing) {
          if (!existing.purpose && nextPurpose) existing.purpose = nextPurpose;
          if (!existing.dose && nextDose) existing.dose = nextDose;
          if (!existing.timing && nextTiming) existing.timing = nextTiming;
          if (!existing.source_paths.includes(sourcePath)) existing.source_paths.push(sourcePath);
          if (rawLabel && !existing.raw_labels.includes(rawLabel)) existing.raw_labels.push(rawLabel);
        } else {
          ledger.set(key, {
            name: parsedValue.name,
            kind: resolvedKind,
            ...(nextPurpose ? { purpose: nextPurpose } : {}),
            ...(nextDose ? { dose: nextDose } : {}),
            ...(nextTiming ? { timing: nextTiming } : {}),
            source_paths: [sourcePath],
            raw_labels: rawLabel ? [rawLabel] : [],
          });
        }
      }
    }
  };

  const engine = parseJson(submission?.engine_input_json) ?? {};
  const payload = parseJson(submission?.payload_json) ?? {};
  const answers = parseJson(submission?.answers) ?? [];

  for (const { fields, path } of tallyFieldCollections(submission)) {
    for (const item of parseTallyCurrentStackFields(fields, path)) {
      addValue(item.kind, item, item.source_paths[0], item.raw_labels[0]);
      const stored = ledger.get(`${item.kind}:${item.name.toLowerCase()}`);
      if (stored) {
        stored.source_paths = Array.from(new Set([...stored.source_paths, ...item.source_paths]));
        stored.raw_labels = Array.from(new Set([...stored.raw_labels, ...item.raw_labels]));
      }
    }
  }

  const directSources: Array<[CurrentStackKind, unknown, string, string]> = [
    ["medication", engine?.medications, "engine_input_json.medications", "medications"],
    ["medication", engine?.meds, "engine_input_json.meds", "meds"],
    ["supplement", engine?.current_supplements, "engine_input_json.current_supplements", "current_supplements"],
    ["supplement", engine?.supplements, "engine_input_json.supplements", "supplements"],
    ["hormone", engine?.hormones, "engine_input_json.hormones", "hormones"],
    ["medication", submission?.medications_text, "submissions.medications", "medications"],
    ["supplement", submission?.supplements_text, "submissions.supplements", "supplements"],
    ["hormone", submission?.hormones_text, "submissions.hormones", "hormones"],
  ];
  for (const [kind, value, path, label] of directSources) addValue(kind, value, path, label);
  for (const [index, row] of (Array.isArray(submission?.medications) ? submission.medications : []).entries())
    addValue("medication", row, `submission_medications[${index}]`, "submission_medications");
  for (const [index, row] of (Array.isArray(submission?.supplements) ? submission.supplements : []).entries())
    addValue("supplement", row, `submission_supplements[${index}]`, "submission_supplements");
  for (const [index, row] of (Array.isArray(submission?.hormones) ? submission.hormones : []).entries())
    addValue("hormone", row, `submission_hormones[${index}]`, "submission_hormones");

  const scan = (raw: unknown, path: string, seen: WeakSet<object> = new WeakSet(), depth = 0) => {
    const value = parseJson(raw);
    if (!value || typeof value !== "object" || depth > 12 || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      value.forEach((item, index) => scan(item, `${path}[${index}]`, seen, depth + 1));
      return;
    }
    const object = value as Record<string, any>;
    const rawKey = object.key ?? object.field?.key ?? object.field?.id;
    const rawLabel = object.label ?? object.field?.label ?? object.title;
    const fieldDescriptor = `${rawKey ?? ""} ${rawLabel ?? ""}`;
    if (isPreferenceFieldOrValue(fieldDescriptor)) return;
    const fieldKind = inferKind(fieldDescriptor);
    if (fieldKind && !DETAIL_LABEL_RE.test(fieldDescriptor)) {
      for (const answerValue of fieldValues(object)) addValue(fieldKind, answerValue, path, String(rawLabel ?? rawKey ?? ""));
    }
    for (const [key, nested] of Object.entries(object)) {
      const kind = inferKind(key);
      if (kind && !DETAIL_LABEL_RE.test(key)) addValue(kind, nested, `${path}.${key}`, key);
      scan(nested, `${path}.${key}`, seen, depth + 1);
    }
  };
  scan(engine, "engine_input_json");
  scan(answers, "answers");
  scan(payload, "payload_json");

  return Array.from(ledger.values());
}
