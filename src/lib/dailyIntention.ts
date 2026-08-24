export const DAILY_INTENTION_PROMPT_VERSION = "daily-intention-v1";

export type DailyIntentionSource = "self" | "ask_lve360";
export type DailyIntentionSuggestionSource = "ai" | "fallback";

export type DailyIntentionSuggestion = {
  focusWord: string;
  phrase: string;
};

export type DailyIntentionRecord = {
  id: string;
  localDate: string;
  phrase: string | null;
  focusWord: string | null;
  source: DailyIntentionSource | null;
  suggestions: DailyIntentionSuggestion[];
  suggestionSource: DailyIntentionSuggestionSource | null;
};

export type DailyIntentionValidation =
  | { ok: true; phrase: string }
  | { ok: false; error: "required" | "too_long" | "negative" | "task_or_metric" | "identity_statement" };
export type DailyIntentionError = Extract<DailyIntentionValidation, { ok: false }>["error"];

const NEGATIVE_PATTERN = /\b(?:don['’]?t|do not|won['’]?t|will not|can['’]?t|cannot|never|avoid|stop|quit|hate|failure|lazy)\b/i;
const METRIC_PATTERN = /\d|%|\b(?:pounds?|lbs?|steps?|minutes?|hours?|repetitions?|reps?|times?)\b/i;
const TASK_PATTERN = /\b(?:finish|complete|clear|submit|deliver|send|schedule|book|buy|spreadsheet|inbox|emails?|task|deadline|chore)\b/i;

function cleanText(value: unknown, limit = 120) {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim().slice(0, limit);
}

export function validateDailyIntention(value: unknown): DailyIntentionValidation {
  let phrase = cleanText(value).replace(/^["“”']+|["“”']+$/g, "").trim();
  if (!phrase) return { ok: false, error: "required" };
  if (NEGATIVE_PATTERN.test(phrase)) return { ok: false, error: "negative" };
  if (METRIC_PATTERN.test(phrase) || TASK_PATTERN.test(phrase)) return { ok: false, error: "task_or_metric" };
  if (!/^I(?:['’]m| am| choose| bring| approach| meet| welcome| practice| embody| create| notice| carry| prioritize| trust| lead| listen| nurture| show| move| act| remain| respond| make| honor| protect| give| stay| hold| seek| value| feel| embrace| treat)\b/i.test(phrase)) {
    const fragmentWords = phrase.match(/[A-Za-zÀ-ÖØ-öø-ÿ'’]+/g) ?? [];
    if (fragmentWords.length > 0 && fragmentWords.length <= 4) {
      phrase = `I choose ${phrase.charAt(0).toLowerCase()}${phrase.slice(1).replace(/[.!?]+$/, "")} today`;
    } else {
      return { ok: false, error: "identity_statement" };
    }
  }
  const words = phrase.match(/[A-Za-zÀ-ÖØ-öø-ÿ0-9'’]+/g) ?? [];
  if (words.length > 11 || phrase.length > 120) return { ok: false, error: "too_long" };
  const punctuated = /[.!?]$/.test(phrase) ? phrase : `${phrase}.`;
  return { ok: true, phrase: punctuated };
}

export function normalizeFocusWord(value: unknown) {
  const text = cleanText(value, 30).replace(/[^A-Za-zÀ-ÖØ-öø-ÿ'’ -]/g, "").trim();
  if (text.length < 2) return null;
  return text.split(/\s+/).slice(0, 2).map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(" ");
}

const FALLBACKS: Record<string, DailyIntentionSuggestion[]> = {
  movement: [
    { focusWord: "Energy", phrase: "I bring steady energy to each choice today." },
    { focusWord: "Momentum", phrase: "I move through today with patient momentum." },
    { focusWord: "Vitality", phrase: "I honor what helps me feel alive today." },
  ],
  nutrition: [
    { focusWord: "Nourishment", phrase: "I choose nourishment with care and curiosity today." },
    { focusWord: "Balance", phrase: "I approach each choice with balance today." },
    { focusWord: "Respect", phrase: "I honor my body with thoughtful choices today." },
  ],
  sleep: [
    { focusWord: "Ease", phrase: "I carry calm energy through today." },
    { focusWord: "Rhythm", phrase: "I honor a steady rhythm today." },
    { focusWord: "Rest", phrase: "I value the choices that support deep rest." },
  ],
  emotional_health: [
    { focusWord: "Calm", phrase: "I meet today with calm and self-respect." },
    { focusWord: "Presence", phrase: "I choose presence in the moment before me." },
    { focusWord: "Compassion", phrase: "I give myself patience as today unfolds." },
  ],
  relationships: [
    { focusWord: "Connection", phrase: "I listen with warmth and genuine curiosity today." },
    { focusWord: "Kindness", phrase: "I bring kindness to every conversation today." },
    { focusWord: "Presence", phrase: "I give people my full presence today." },
  ],
  focus: [
    { focusWord: "Clarity", phrase: "I approach today with calm clarity." },
    { focusWord: "Attention", phrase: "I give my attention to what matters now." },
    { focusWord: "Purpose", phrase: "I act with purpose and steady focus today." },
  ],
  career: [
    { focusWord: "Purpose", phrase: "I bring calm confidence to my work today." },
    { focusWord: "Growth", phrase: "I welcome useful challenges with curiosity today." },
    { focusWord: "Leadership", phrase: "I lead with clarity, patience, and integrity today." },
  ],
  happiness: [
    { focusWord: "Joy", phrase: "I notice joy in ordinary moments today." },
    { focusWord: "Gratitude", phrase: "I meet today with gratitude and openness." },
    { focusWord: "Lightness", phrase: "I bring lightness to the day before me." },
  ],
  overall_health: [
    { focusWord: "Balance", phrase: "I choose balance in the moments I can shape." },
    { focusWord: "Care", phrase: "I treat my wellbeing as worthy of care today." },
    { focusWord: "Consistency", phrase: "I value small choices that reflect who I am." },
  ],
};

export function fallbackDailyIntentionSuggestions(identityDirection?: string | null) {
  return FALLBACKS[identityDirection ?? ""] ?? FALLBACKS.overall_health;
}

export function parseDailyIntentionSuggestions(value: unknown, identityDirection?: string | null) {
  const raw = value && typeof value === "object" && !Array.isArray(value)
    ? (value as { suggestions?: unknown }).suggestions
    : null;
  const parsed: DailyIntentionSuggestion[] = [];
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const candidate = item as { focus_word?: unknown; phrase?: unknown };
      const focusWord = normalizeFocusWord(candidate.focus_word);
      const validation = validateDailyIntention(candidate.phrase);
      if (!focusWord || !validation.ok) continue;
      if (parsed.some((existing) => existing.phrase.toLowerCase() === validation.phrase.toLowerCase())) continue;
      parsed.push({ focusWord, phrase: validation.phrase });
    }
  }
  for (const fallback of fallbackDailyIntentionSuggestions(identityDirection)) {
    if (parsed.length >= 3) break;
    if (!parsed.some((item) => item.phrase.toLowerCase() === fallback.phrase.toLowerCase())) parsed.push(fallback);
  }
  return parsed.slice(0, 3);
}

export function dailyIntentionErrorMessage(error: DailyIntentionError) {
  if (error === "too_long") return "Keep the intention to 11 words or fewer.";
  if (error === "negative") return "Frame the intention around what you want to embody today.";
  if (error === "task_or_metric") return "Choose a mindset or way of showing up, rather than a task or number.";
  if (error === "identity_statement") return "Start with an identity statement such as “I choose” or “I bring.”";
  return "Add a short intention for today.";
}
