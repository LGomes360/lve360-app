export type WeeklySynthesisDecision = "keep" | "shrink" | "swap" | "pause" | "advance";

const DIRECT_VOICE_PATTERN = /\b(?:you|your|yours|yourself|you're|you've|you'll|you'd)\b/i;
const THIRD_PERSON_MEMBER_PATTERN = /\b(?:the member|the user|they|them|their|theirs|themself|themselves)\b/i;

const DECISION_LANGUAGE: Record<WeeklySynthesisDecision, RegExp> = {
  keep: /\b(?:keep|repeat|repeating|same|current version|another week|consistent|consistency)\b/i,
  shrink: /\b(?:shrink|smaller|easier|reduce|lower|minimum version|tiny)\b/i,
  swap: /\b(?:swap|different|another practice|replace|replacement)\b/i,
  pause: /\b(?:pause|hold|step away|take a break|stop for now)\b/i,
  advance: /\b(?:advance|increase|add|build|grow|more|next level)\b/i,
};

const CONTRADICTS_KEEP_PATTERN = /\b(?:try|consider|test|explore|benefit from)\s+(?:to\s+)?(?:adjust|change|shrink|reduce|swap|replace|pause|increase|add)\w*\b|\b(?:adjusting|changing|shrinking|reducing|swapping|replacing|pausing|increasing)\b/i;
const NEGATED_CHANGE_PATTERN = /\b(?:without|not)\s+(?:adjusting|changing|shrinking|reducing|swapping|replacing|pausing|increasing)\b/gi;

export function normalizeMemberVoice(value: string, field: "observation" | "hypothesis") {
  let normalized = value
    .replace(/\b(?:the member's|the user's)\b/gi, (match) => /^[A-Z]/.test(match) ? "Your" : "your")
    .replace(/\b(?:the member|the user)\b/gi, (match) => /^[A-Z]/.test(match) ? "You" : "you")
    .replace(/\b(?:their|theirs)\b/gi, (match) => /^[A-Z]/.test(match) ? "Your" : "your")
    .replace(/\b(?:they|them|themself|themselves)\b/gi, (match) => /^[A-Z]/.test(match) ? "You" : "you");
  if (!DIRECT_VOICE_PATTERN.test(normalized)) {
    const prefix = field === "observation" ? "Your record shows: " : "For your next week, ";
    normalized = `${prefix}${normalized.charAt(0).toLowerCase()}${normalized.slice(1)}`;
  }
  return normalized;
}

export function usesDirectMemberVoice(observation: string, hypothesis: string) {
  return DIRECT_VOICE_PATTERN.test(observation)
    && DIRECT_VOICE_PATTERN.test(hypothesis)
    && !THIRD_PERSON_MEMBER_PATTERN.test(observation)
    && !THIRD_PERSON_MEMBER_PATTERN.test(hypothesis);
}

export function hypothesisSupportsDecision(hypothesis: string, decision: WeeklySynthesisDecision) {
  if (!DECISION_LANGUAGE[decision].test(hypothesis)) return false;
  if (decision === "keep" && CONTRADICTS_KEEP_PATTERN.test(hypothesis.replace(NEGATED_CHANGE_PATTERN, ""))) return false;
  return true;
}
