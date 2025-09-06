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
  if (!field || !Array.isArray(raw)) return [];
  const map = new Map<string, string>((field.options ?? []).map((o) => [o.id, o.text]));
  return (raw as string[]).map((id) => map.get(id) ?? id);
}

// ---------- Main mapper ----------
export function mapTallyToEngine(
  payload: TallyPayload,
  version: 'v1' | 'v2' = 'v2'
): EngineInput {
  const fields: TallyField[] = payload?.answers?.fields ?? [];

  // Contact
  const email =
    (getValue(fields, ['Email Address (we’ll send your report here)', 'Email']) as string | undefined) ||
    payload.user_email ||
    '';

  // Profile basics
  const dob = getValue(fields, ['Date of Birth (used . to . . calculate age)', 'Date of Birth']) as string | undefined;
  const heightRaw = getValue(fields, ['Height']) as string | undefined;
  const weightLb = getValue(fields, ['Weight (lbs)']) as number | undefined;

  // Sex at birth
  const sexText = getSingleOptionText(fields, 'Sex at Birth');
  const sexAtBirth =
    sexText?.toLowerCase().includes('male') ? 'M'
    : sexText?.toLowerCase().includes('female') ? 'F'
    : undefined;

  // Gender identity
  const genderIdentity = getSingleOptionText(fields, 'Gender Identity (Optional)');

  // Goals (multi-select)
  const goals = getMultiOptionTexts(fields, 'What are your top health goals');

  // Behaviors
  const skipsMeals = getSingleOptionText(fields, 'Do you skip meals?');

  // Self-ratings
  const energyRating = getValue(fields, [
    'How would you rate your energy on a typical day?',
    'How would you rate your energy on a typical day?\n\n',
  ]) as number | undefined;

  const sleepRating = getValue(fields, [
    'How would you rate your sleep?',
    'How would you rate your sleep?\n\n',
  ]) as number | undefined;

  // Allergies
  const allergiesAnswer = getValue(fields, ['What are you allergic to?']) as string | undefined;
  const allergies = normalizeList(allergiesAnswer);

  // Conditions (multi-select) — allow label variants with/without trailing newline
  const conditions =
    getMultiOptionTexts(fields, 'Do you have any current health conditions') ||
    getMultiOptionTexts(fields, 'Do you have any current health conditions?\n');

  // Medications (two rows supported here; extend as needed)
  const med1Name    = getValue(fields, ['List Medication\n', 'List Medication']) as string | undefined;
  const med1Purpose = getValue(fields, ['e.g., Blood Sugar']) as string | undefined;
  const med1Dose    = getValue(fields, ['500mg']) as string | undefined;
  const med1Freq    = getValue(fields, ['2 x Daily']) as string | undefined;

  const med2Name    = getValue(fields, ['Medication 2']) as string | undefined;
  const med2Purpose = getValue(fields, ['Purpose e.g., for blood pressure']) as string | undefined;
  const med2Dose    = getValue(fields, ['Dosage e.g., 50mg']) as string | undefined;
  const med2Freq    = getValue(fields, ['Frequency e.g., Daily, AM, PM, Both']) as string | undefined;

  const medications: EngineInput['medications'] = [];
  const pushMed = (name?: string, purpose?: string, dose?: string, frequency?: string) => {
    if (name || purpose || dose || frequency) {
      medications.push({ name: name || '', purpose, dose, frequency });
    }
  };
  pushMed(med1Name,  med1Purpose,  med1Dose,  med1Freq);
  pushMed(med2Name,  med2Purpose,  med2Dose,  med2Freq);

  // Height parsing + derived metrics
  const { ft: height_ft, in: height_in } = parseHeightUS(heightRaw);
  const profile: EngineInput['profile'] = {
    dob,
    sexAtBirth,
    genderIdentity,
    height_ft,
    height_in,
    weight_lb: weightLb,
  };
  const metrics = deriveMetrics(profile);
  profile.height_cm = metrics.height_cm;
  profile.weight_kg = metrics.weight_kg;

  // Assemble engine input
  const engineInput: EngineInput = {
    submission_id: payload.id || payload.eventId || '',
    contact: { email: String(email) },
    profile,
    goals,
    behaviors: { skips_meals: skipsMeals || undefined },
    self_ratings: {},
    conditions,
    medications,
    allergies,
    current_supplements: [],
    preferences: {},
    date_iso: new Date().toISOString(),
  };

  if (energyRating !== undefined) engineInput.self_ratings!['energy'] = energyRating;
  if (sleepRating !== undefined) engineInput.self_ratings!['sleep'] = sleepRating;

  // Example for future budget parsing:
  // const [budget_min, budget_max] = parseBudget(getValue(fields, ['Budget']) as string | undefined);
  // engineInput.preferences = { ...engineInput.preferences, budget_min, budget_max };

  return engineInput;
}
