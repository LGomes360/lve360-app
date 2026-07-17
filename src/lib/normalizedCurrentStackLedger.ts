export type CurrentStackKind = "medication" | "supplement" | "hormone";

export type NormalizedCurrentStackLedgerItem = {
  name: string;
  kind: CurrentStackKind;
  dose?: string;
  timing?: string;
  source_paths: string[];
  raw_labels: string[];
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INVALID_NAME_RE = /^(?:\[object Object\]|tbd|none|null|no|n\/?a|blank|no (?:medications?|supplements?|hormones?)|not reported)$/i;
const KIND_PATTERNS: Array<[CurrentStackKind, RegExp]> = [
  ["hormone", /\b(?:hormones?|trt|testosterone|dhea|pregnenolone)\b/i],
  ["medication", /\b(?:medications?|prescriptions?|drugs?|glp(?:[ -]?1)?|thyroid)\b/i],
  ["supplement", /\b(?:supplements?|vitamins?|current[ _-]?stack)\b/i],
];
const DETAIL_KEYS = new Set(["dose", "dosage", "amount", "timing", "frequency", "schedule", "purpose", "notes"]);
const METADATA_KEYS = new Set(["id", "key", "type", "options", "submission_id", "field_id", "created_at", "updated_at"]);

function parseJson(value: unknown): any {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed || !/^[\[{]/.test(trimmed)) return value;
  try { return JSON.parse(trimmed); } catch { return value; }
}

function readableText(value: unknown): string | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const text = String(value).replace(/\s+/g, " ").trim();
  return text && !INVALID_NAME_RE.test(text) && !UUID_RE.test(text) ? text : undefined;
}

export function extractLedgerReadableNames(
  raw: unknown,
  seen: WeakSet<object> = new WeakSet(),
  depth = 0
): string[] {
  const value = parseJson(raw);
  if (value == null || depth > 12) return [];
  if (typeof value === "string") {
    return value.split(/,|\n|;|\|/).map(readableText).filter((name): name is string => Boolean(name));
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
  return readableText(value) ?? extractLedgerReadableNames(value)[0];
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

export function buildNormalizedCurrentStackLedger(submission: any): NormalizedCurrentStackLedgerItem[] {
  const ledger = new Map<string, NormalizedCurrentStackLedgerItem>();
  const addValue = (kind: CurrentStackKind, raw: unknown, sourcePath: string, rawLabel?: string) => {
    const parsed = parseJson(raw);
    const parts = Array.isArray(parsed) ? parsed : [parsed];
    for (const part of parts) {
      const names = extractLedgerReadableNames(part);
      for (const name of names) {
        if (!name || UUID_RE.test(name) || INVALID_NAME_RE.test(name)) continue;
        const key = `${kind}:${name.toLowerCase()}`;
        const object = part && typeof part === "object" && !Array.isArray(part) ? part as Record<string, any> : {};
        const nextDose = detailFrom(object.dose ?? object.dosage ?? object.amount);
        const nextTiming = detailFrom(object.timing ?? object.frequency ?? object.schedule);
        const existing = ledger.get(key);
        if (existing) {
          if (!existing.dose && nextDose) existing.dose = nextDose;
          if (!existing.timing && nextTiming) existing.timing = nextTiming;
          if (!existing.source_paths.includes(sourcePath)) existing.source_paths.push(sourcePath);
          if (rawLabel && !existing.raw_labels.includes(rawLabel)) existing.raw_labels.push(rawLabel);
        } else {
          ledger.set(key, {
            name,
            kind,
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
    const fieldKind = inferKind(`${rawKey ?? ""} ${rawLabel ?? ""}`);
    if (fieldKind) {
      for (const answerValue of fieldValues(object)) addValue(fieldKind, answerValue, path, String(rawLabel ?? rawKey ?? ""));
    }
    for (const [key, nested] of Object.entries(object)) {
      const kind = inferKind(key);
      if (kind) addValue(kind, nested, `${path}.${key}`, key);
      scan(nested, `${path}.${key}`, seen, depth + 1);
    }
  };
  scan(engine, "engine_input_json");
  scan(answers, "answers");
  scan(payload, "payload_json");

  return Array.from(ledger.values()).sort((a, b) =>
    a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name)
  );
}
