import "server-only";

import { CONTEXTUAL_COACH_PROMPT_VERSION } from "./promptVersions.ts";

export type AiCapability = "mini" | "main";

export type AiTask =
  | "blueprint_recommendations"
  | "blueprint_safety"
  | "blueprint_narrative"
  | "blueprint_repair"
  | "blueprint_repair_main"
  | "today_brief"
  | "routine_label_parser"
  | "weekly_review_synthesis"
  | "weekly_insight"
  | "contextual_coach";

export type AiTaskProfile = {
  capability: AiCapability;
  promptVersion: string;
  reasoningEffort: "none" | "low" | "medium";
};

const DEFAULT_MODELS = {
  MAIN: "gpt-5.6-terra",
  MINI: "gpt-5.6-luna",
  FALLBACK_MAIN: "gpt-5",
  FALLBACK_MINI: "gpt-5-mini",
} as const;

const TASK_PROFILES: Record<AiTask, AiTaskProfile> = {
  blueprint_recommendations: {
    capability: "mini",
    promptVersion: "blueprint-recommendations-v1",
    reasoningEffort: "low",
  },
  blueprint_safety: {
    capability: "mini",
    promptVersion: "blueprint-safety-v1",
    reasoningEffort: "low",
  },
  blueprint_narrative: {
    capability: "main",
    promptVersion: "blueprint-narrative-v1",
    reasoningEffort: "low",
  },
  blueprint_repair: {
    capability: "mini",
    promptVersion: "blueprint-repair-v1",
    reasoningEffort: "low",
  },
  blueprint_repair_main: {
    capability: "main",
    promptVersion: "blueprint-repair-main-v1",
    reasoningEffort: "low",
  },
  today_brief: {
    capability: "mini",
    promptVersion: "today-brief-v2",
    reasoningEffort: "low",
  },
  routine_label_parser: {
    capability: "mini",
    promptVersion: "routine-label-parser-v1",
    reasoningEffort: "low",
  },
  weekly_review_synthesis: {
    capability: "mini",
    promptVersion: "weekly-review-synthesis-v2",
    reasoningEffort: "low",
  },
  weekly_insight: {
    capability: "mini",
    promptVersion: "weekly-insight-v1",
    reasoningEffort: "low",
  },
  contextual_coach: {
    capability: "mini",
    promptVersion: CONTEXTUAL_COACH_PROMPT_VERSION,
    reasoningEffort: "low",
  },
};

function configured(name: string, fallback: string) {
  return process.env[name]?.trim() || fallback;
}

export function resolvedModels() {
  return {
    MAIN: configured("OPENAI_MAIN_MODEL", DEFAULT_MODELS.MAIN),
    MINI: configured("OPENAI_MINI_MODEL", DEFAULT_MODELS.MINI),
    FALLBACK_MAIN: configured("OPENAI_FALLBACK_MAIN_MODEL", DEFAULT_MODELS.FALLBACK_MAIN),
    FALLBACK_MINI: configured("OPENAI_FALLBACK_MINI_MODEL", DEFAULT_MODELS.FALLBACK_MINI),
  };
}

export function candidateModels(capability: AiCapability) {
  const models = resolvedModels();
  const candidates = capability === "main"
    ? [models.MAIN, models.FALLBACK_MAIN]
    : [models.MINI, models.FALLBACK_MINI];

  return Array.from(new Set(candidates.filter(Boolean)));
}

export function taskProfile(task: AiTask): AiTaskProfile {
  return TASK_PROFILES[task];
}
