export type CurrentStackKind = "medication" | "supplement" | "hormone";

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
const INVALID_NAME_RE = /^(?:\[object Object\]|tbd|none|null|no|n\/?a|blank|no (?:medications?|supplements?|hormones?)|not reported)$/i;
const KIND_PATTERNS: Array<[CurrentStackKind, RegExp]> = [
  ["hormone", /\b(?:hormones?|trt|testosterone|dhea|pregnenolone)\b/i],
  ["medication", /\b(?:medications?|prescriptions?|drugs?|glp(?:[ -]?1)?|thyroid)\b/i],
  ["supplement", /\b(?:supplements?|vitamins?|current[ _-]?stack)\b/i],
];
const DETAIL_KEYS = new Set(["dose", "dosage", "amount", "timing", "frequency", "schedule", "purpose", "notes"]);
const METADATA_KEYS = new Set(["id", "key", "type", "options", "submission_id", "field_id", "created_at", "updated_at"]);
const DETAIL_LABEL_RE = /\b(?:purpose|dose|dosage|frequency|timing|how often|when taken)\b/i;
const YES_NO_RE = /^(?:yes|no|true|false)$/i;

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
    if (!label) return;

    if (DETAIL_LABEL_RE.test(label)) {
      if (!currentItems.length) return;
      const detail = fieldDetail(field);
      if (!detail) return;
      for (const currentItem of currentItems) {
        if (/\b(?:purpose)\b/i.test(label)) {
          currentItem.purpose = currentItem.purpose ?? detail;
        } else if (/\b(?:dose|dosage)\b/i.test(label)) {
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
      .filter((name) => !YES_NO_RE.test(name) && !UUID_RE.test(name) && !INVALID_NAME_RE.test(name));
    currentItems = [];
    for (const name of names) {
      const item: NormalizedCurrentStackLedgerItem = {
        name,
        kind,
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
      for (const name of names) {
        if (!name || YES_NO_RE.test(name) || UUID_RE.test(name) || INVALID_NAME_RE.test(name)) continue;
        const key = `${kind}:${name.toLowerCase()}`;
        const object = part && typeof part === "object" && !Array.isArray(part) ? part as Record<string, any> : {};
        const nextDose = detailFrom(object.dose ?? object.dosage ?? object.amount);
        const nextTiming = detailFrom(object.timing ?? object.frequency ?? object.schedule);
        const nextPurpose = detailFrom(object.purpose ?? object.notes);
        const existing = ledger.get(key);
        if (existing) {
          if (!existing.purpose && nextPurpose) existing.purpose = nextPurpose;
          if (!existing.dose && nextDose) existing.dose = nextDose;
          if (!existing.timing && nextTiming) existing.timing = nextTiming;
          if (!existing.source_paths.includes(sourcePath)) existing.source_paths.push(sourcePath);
          if (rawLabel && !existing.raw_labels.includes(rawLabel)) existing.raw_labels.push(rawLabel);
        } else {
          ledger.set(key, {
            name,
            kind,
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
