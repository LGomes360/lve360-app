// src/lib/openai.ts
// Lazy OpenAI client factory to avoid throwing at module-load time.

import OpenAI from "openai";

export function getOpenAiClient(): OpenAI {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error("OPENAI_API_KEY is not set. Set it in environment or .env.local for local dev.");
  }
  return new OpenAI({ apiKey: key });
}
