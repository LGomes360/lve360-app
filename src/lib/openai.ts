// src/lib/openai.ts
// Backwards-compatible lazy OpenAI initializer.
//
// Exports:
//  - getOpenAI()        => preferred name (sync-style; throws if key missing)
//  - getOpenAiClient    => alias for older imports in the repo
//
// Implementation uses require() so the client is not created at module-load time
// in environments that would cause build-time failures.

type OpenAIClient = any;

let _client: OpenAIClient | null = null;

export function getOpenAI(): OpenAIClient {
  if (_client) return _client;

  const key = process.env.OPENAI_API_KEY || process.env.NEXT_PUBLIC_OPENAI_API_KEY;
  if (!key) {
    throw new Error("Missing OPENAI_API_KEY — set as environment variable or GitHub Action secret.");
  }

  // dynamic require to avoid bundlers eagerly resolving this at build time.
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-unsafe-assignment
  const pkg = require("openai");
  // Support both CJS and ESM default export shapes:
  // pkg.default (ESM transpiled), or pkg (CJS).
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  const OpenAI = (pkg && pkg.default) ? pkg.default : pkg;
  _client = new OpenAI({ apiKey: key });
  return _client;
}

// Legacy alias to satisfy files that import `getOpenAiClient`.
export const getOpenAiClient = getOpenAI;

// Also provide a default export (optional) for any modules importing default.
export default getOpenAI;
