// src/lib/mapTallyToEngine.ts

export type EngineInput = {
  submission_id: string;
  contact: { email: string };
  profile: {
    dob?: string;
    sexAtBirth?: string;
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

// Helper functions:

function normalizeList(value: any): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((v: any) => String(v).trim()).filter(Boolean);
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
  let match;
  // match patterns like 5'10", 5’10”, 5-10
  match = s.match(/^(\d{1,2})[\u2032'\u2019]?\s*[-]?\s*(\d{1,2})["\u201d]?$/);
  if (match) return { ft: parseInt(match[1], 10), in: parseInt(match[2], 10) };
  // match 70in or 70"
  match = s.match(/^(\d{2,3})(?:in|")$/);
  if (match) {
    const total = parseInt(match[1], 10);
    return { ft: Math.floor(total / 12), in: total % 12 };
  }
  // match cm
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

// Types for Tally fields and payload
interface TallyOption {
  id: string;
  text: string;
}
interface TallyField {
  key: string;
  type: string;
  label: string;
  value: any;
  options?: TallyOption[];
}
interface TallyAnswers {
  fields: TallyField[];
}
interface TallyPayload {
  id?: string;
  eventId?: string;
  user_email?: string;
  answers?: TallyAnswers;
}

// Main mapper function
export function mapTallyToEngine(
  payload: TallyPayload,
  version: 'v1' | 'v2' = 'v2'
): EngineInput {
  const fields: TallyField[] = payload?.answers?.fields || [];
  // helper to get value by matching id or label
  const getValue = (labels: string[]): any => {
    for (const field of fields) {
      if (labels.includes(field.key) || labels.includes(field.label)) {
        return field.value;
      }
    }
    return undefined;
  };
  // email
  const email =
    getValue(['Email Address (we’ll send your report here)', 'Email']) ||
    payload.user_email ||
    '';
  const dob = getValue(['Date of Birth (used . to . . calculate age)', 'Date of Birth']);
  const heightRaw = getValue(['Height']) as string | undefined;
  const weightLb = getValue(['Weight (lbs)']) as number | undefined;
  // sex at birth parsing
  const sexId = getValue(['Sex at Birth']) as string[] | undefined;
  const sexField = fields.find((f) => f.label === 'Sex at Birth');
  const sexOption =
    Array.isArray(sexId) && sexField?.options?.find((o) => o.id === sexId[0]);
  const sexText = sexOption?.text || undefined;
  const sexAtBirth = sexText
    ? sexText.toLowerCase().includes('male')
      ? 'M'
      : sexText.toLowerCase().includes('female')
      ? 'F'
      : undefined
    : undefined;
  // gender identity
  const genderId = getValue(['Gender Identity (Optional)']) as string[] | undefined;
  const genderField = fields.find((f) => f.label === 'Gender Identity (Optional)');
  const genderOption =
    Array.isArray(genderId) &&
    genderField?.options?.find((o) => o.id === genderId[0]);
  const genderIdentity = genderOption?.text || undefined;
  // goals
  const goalsIds = getValue(['What are your top health goals']) as string[] | undefined;
  const goalsField = fields.find((f) => f.label === 'What are your top health goals');
  let goals: string[] = [];
  if (Array.isArray(goalsIds) && goalsField?.options) {
    goals = goalsIds.map((id: string) => {
      const opt = goalsField.options?.find((o) => o.id === id);
      return opt?.text || id;
    });
  }
  // behaviors
  const skipsMealsId = getValue(['Do you skip meals?']) as string[] | undefined;
  const skipsMealsField = fields.find((f) => f.label === 'Do you skip meals?');
  const skipsMeals =
    skipsMealsField && Array.isArray(skipsMealsId)
      ? skipsMealsField.options?.find((o) => o.id === skipsMealsId[0])?.text ||
        ''
      : undefined;
  // self ratings
  const energyRating = getValue([
    'How would you rate your energy on a typical day?',
    'How would you rate your energy on a typical day?\n\n',
  ]) as number | undefined;
  const sleepRating = getValue([
    'How would you rate your sleep?',
    'How would you rate your sleep?\n\n',
  ]) as number | undefined;
  // allergies
  const allergiesAnswer = getValue(['What are you allergic to?']) as string | undefined;
  const allergies = normalizeList(allergiesAnswer);
  // conditions
  const conditionsIds = getValue(['Do you have any current health conditions?\n']) as
    | string[]
    | undefined;
  const conditionsField = fields.find((f) =>
    f.label.startsWith('Do you have any current health conditions')
  );
  let conditions: string[] = [];
  if (Array.isArray(conditionsIds) && conditionsField?.options) {
    conditions = conditionsIds.map((id: string) => {
      const opt = conditionsField.options?.find((o) => o.id === id);
      return opt?.text || id;
    });
  }
  // medications (we support two in this mapper; extend as needed)
  const med1Name = getValue(['List Medication\n', 'List Medication']) as string | undefined;
  const med1Purpose = getValue(['e.g., Blood Sugar']) as string | undefined;
  const med1Dose = getValue(['500mg']) as string | undefined;
  const med1Freq = getValue(['2 x Daily']) as string | undefined;
  const med2Name = getValue(['Medication 2']) as string | undefined;
  const med2Purpose = getValue(['Purpose e.g., for blood pressure']) as string | undefined;
  const med2Dose = getValue(['Dosage e.g., 50mg']) as string | undefined;
  const med2Freq = getValue(['Frequency e.g., Daily, AM, PM, Both']) as string | undefined;
  const medications: EngineInput['medications'] = [];
  function pushMed(
    name?: string,
    purpose?: string,
    dose?: string,
    freq?: string
  ) {
    if (name || purpose || dose || freq) {
      medications.push({ name: name || '', purpose, dose, frequency: freq });
    }
  }
  pushMed(med1Name, med1Purpose, med1Dose, med1Freq);
  pushMed(med2Name, med2Purpose, med2Dose, med2Freq);
  // current supplements and preferences placeholders (extend mapping as needed)

  // parse height and derive metrics
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
  // build engine input
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
  if (energyRating !== undefined) {
    engineInput.self_ratings = engineInput.self_ratings || {};
    engineInput.self_ratings['energy'] = energyRating;
  }
  if (sleepRating !== undefined) {
    engineInput.self_ratings = engineInput.self_ratings || {};
    engineInput.self_ratings['sleep'] = sleepRating;
  }
  return engineInput;
}
