export const AI_MODELS = {
  "gpt-5-mini":  { acceptsTemperature: false, maxKey: "max_completion_tokens" },
  "gpt-5":       { acceptsTemperature: true,  maxKey: "max_completion_tokens" },
  "gpt-4o":      { acceptsTemperature: true,  maxKey: "max_tokens" },
  "gpt-4o-mini": { acceptsTemperature: true,  maxKey: "max_tokens" },
} as const;

export function modelCaps(model: string) {
  const key = (Object.keys(AI_MODELS) as string[]).find(k => model.startsWith(k));
  return key ? (AI_MODELS as any)[key] : { acceptsTemperature: false, maxKey: "max_tokens" };
}
