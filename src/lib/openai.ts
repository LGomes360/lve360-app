// src/lib/openai.ts
import assert from "assert";

let _client: any | null = null;

/**
 * Return a lazily initialized OpenAI client.
 * Does NOT instantiate at module load time, so build-time doesn't require OPENAI_API_KEY.
 */
export function getOpenAI() {
  if (_client) return _client;

  const key = process.env.OPENAI_API_KEY || process.env.NEXT_PUBLIC_OPENAI_API_KEY;
  if (!key) {
    // do not throw at module load time; only throw when someone actually tries to call the API.
    throw new Error("Missing OPENAI_API_KEY; set as env or GitHub Action secret.");
  }

  // If you use official OpenAI SDK:
  // import { OpenAI } from "openai"; return new OpenAI({ apiKey: key });
  // But do a dynamic import to avoid build-time require:
  // (we'll use a minimal dynamic import pattern)
  const OpenAI = require("openai").default || require("openai");
  _client = new OpenAI({ apiKey: key });
  return _client;
}
