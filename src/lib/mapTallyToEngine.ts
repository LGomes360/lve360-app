// src/lib/mapTallyToEngine.ts

// ---------- Public types ----------
export type EngineInput = {
  submission_id: string;
  contact: { email: string };
  profile: {
    dob?: string;
    sexAtBirth?: string;        // 'M' | 'F'
    genderIdentity?: string;
    height_ft?: number;
    height_in?: number;
    weight_lb?: number;
    height_cm?: number;
    weight_kg?: number;
  };
  goals: string[];
  behaviors: {
    skips_meals?: string;
    water?: string;
    energy_drops?: string;
  };
  self_ratings?: Record<string, number>;
  conditions: string[];
  medications: Array<{ name: string; purpose?: string; dose?: string; frequency?: string }>;
  allergies: string[];
  current_supplements: Array<{ name: string; brand?: string; dose?: string; timing?: string }>;
  preferences: {
    budget_min?: number;
    budget_max?: number;
    intake?: string;
    form?: string;
    shop?: string;
  };
  date_iso?: string;
};

// ---------- Tally payload types ----------
export interface TallyOption {
  id: string;
  text: string;
}
export interface TallyField {
  key: string;
  type: string;
  label: string;
  value: unknown;
  options?: TallyOption[];
}
export interface TallyAnswers {
  fields: TallyField[];
}
export interface TallyPayload {
  id?: string;
  eventId?: string;
  user_email?: string;
  answers?: TallyAnswers;
}

// ---------- Helpers (generic) ----------
function normalizeList(value: unknown): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  return String(value)
    .split(/,|\n|;/)
    .map((v) => v.trim())
    .filter(Boolean);
}

function parseBudget(range?: string): [number?, number?] {
  if (!range) return [undefined, undefined];
  const numbers = range.match(/\d+/g);
  if (!numbers) return [undefined, undefined];
  const values = numbers.map((n) => parseInt(n, 10));
  if (values.length >= 2) return [values[0], values[1]];
  if (values.length === 1) return [values[0], undefined];
  return [undefined, undefined];
}

function parseHeightUS(raw?: string): { ft?: number; in?: number } {
  if (!raw) return {};
  const s = raw.replace(/\s+/g, '').toLowerCase();

  // 5'10", 5’10”, 5-10
  let match = s.match(/^(\d{1,2})[\u2032'\u2019]?\s*[-]?\s*(\d{1,2})["\u201d]?$/);
  if (match) return { ft: parseInt(match[1], 10), in: parseInt(match[2], 10) };

  // 70in or 70"
  match = s.match(/^(\d{2,3})(?:in|")$/);
  if (match) {
    const total = parseInt(match[1], 10);
    return { ft: Math.floor(total / 12), in: total % 12 };
  }

  // 178 cm
  match = s.match(/^(\d+(?:\.\d+)?)\s*cm$/);
  if (match) {
    const cm = parseFloat(match[1]);
    const totalIn = cm / 2.54;
    return { ft: Math.floor(totalIn / 12), in: Math.round(totalIn % 12) };
  }
  return {};
}

function deriveMetrics(profile: {
  height_ft?: number;
  height_in?: number;
  weight_lb?: number;
  height_cm?: number;
  weight_kg?: number;
}): { height_cm?: number; weight_kg?: number } {
  const totalIn = (profile.height_ft ?? 0) * 12 + (profile.height_in ?? 0);
  const height_cm =
    profile.height_cm ?? (totalIn ? +(totalIn * 2.54).toFixed(1) : undefined);
  const weight_kg =
    profile.weight_kg ??
    (profile.weight_lb ? +(profile.weight_lb / 2.20462).toFixed(1) : undefined);
  return { height_cm, weight_kg };
}

// ---------- Helpers (Tally-specific) ----------
function findField(fields: TallyField[], labels: string[]): TallyField | undefined {
  return fields.find((f) => labels.includes(f.key) || labels.includes(f.label));
}

function getValue(fields: TallyField[], labels: string[]): unknown {
  const f = findField(fields, labels);
  return f?.value;
}

function getSingleOptionText(
  fields: TallyField[],
  label: string
): string | undefined {
  const field = fields.find((f) => f.label === label);
  const raw = field?.value;
  if (!field || !Array.isArray(raw) || raw.length === 0 || !field.options) return undefined;
  const opt = field.options.find((o) => o.id === raw[0]);
  return opt?.text;
}

function getMultiOptionTexts(
  fields: TallyField[],
  label: string
): string[] {
  const field = fields.find((f) => f.label === label);
  const raw = field?.value;
  if (!field || !Array.isArray(raw) || !field.options) return [];
  return raw
    .map((id: string) => field.options!.find((o) => o.id ==
