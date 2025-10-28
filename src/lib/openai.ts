/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/consistent-type-imports */
// ---------------------------------------------------------------------------
// LVE360 — src/lib/openai.ts
// Minimal wrapper around OpenAI Responses API that:
//  • Accepts "messages" (system/user/assistant)
//  • Uses Responses API "input" with { type: "input_text" }
//  • Supports temperature + max tokens (as max_output_tokens)
//  • Enforces a 55s timeout so Vercel functions don’t hit 120s hard cap
//  • Normalizes return shape to look like Chat Completions:
//      { model, usage:{prompt_tokens, completion_tokens, total_tokens},
//        choices:[{ message:{ content } }] }
// ---------------------------------------------------------------------------

type Role = "system" | "user" | "assistant";

export type ChatMessage = {
  role: Role;
  content: string;
};

type CallOpts = {
  max?: number;          // preferred (we normalize to max_output_tokens)
  maxTokens?: number;    // legacy alias
  temperature?: number;
  timeoutMs?: number;    // per-call override, defaults to 55_000
};

type RawResponsesUsage = {
  // Responses API fields
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;

  // Old-style fields (we populate these for compatibility)
  prompt_tokens?: number;
  completion_tokens?: number;
};

type RawResponsesResult = {
  id?: string;
  model?: string;
  output_text?: string;
  output?: Array<{
    id?: string;
    type?: string;
    role?: string;
    content?: Array<{
      type: string; // "output_text" etc.
      text?: string;
      annotations?: any[];
    }>;
  }>;
  usage?: RawResponsesUsage;
  // …other fields we don't rely on
};

function env(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`${key} is not set`);
  return v;
}

function buildInput(messages: ChatMessage[]) {
  // Responses API expects: [{ role, content: [{ type: "input_text", text }] }]
  return messages.map((m) => ({
    role: m.role,
    content: [
      {
        type: "input_text",
        text:
          typeof m.content === "string"
            ? m.content
            : JSON.stringify(m.content, null, 2),
      },
    ],
  }));
}

function extractText(res: RawResponsesResult): string {
  if (typeof res.output_text === "string" && res.output_text.trim().length) {
    return res.output_text;
  }
  // Fallback: walk the output chunks
  const chunkText =
    res.output?.flatMap((c) =>
      (c.content ?? [])
        .filter((p) => p && p.type && "text" in p && typeof p.text === "string")
        .map((p: any) => p.text as string)
    ) ?? [];
  return chunkText.join("\n").trim();
}

function normalizeUsage(u?: RawResponsesUsage): Required<RawResponsesUsage> {
  const input = u?.input_tokens ?? u?.prompt_tokens ?? 0;
  const output = u?.output_tokens ?? u?.completion_tokens ?? 0;
  const total = u?.total_tokens ?? (input + output);

  return {
    input_tokens: u?.input_tokens ?? input,
    output_tokens: u?.output_tokens ?? output,
    total_tokens: total,
    // Compat fields expected by generateStack.ts:
    prompt_tokens: u?.prompt_tokens ?? input,
    completion_tokens: u?.completion_tokens ?? output,
  };
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {}
) {
  const { timeoutMs = 55_000, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await fetch(url, { ...rest, signal: controller.signal });
    return resp;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * callLLM(messages, model, { max?, maxTokens?, temperature?, timeoutMs? })
 * Returns a Chat-Completions-like object:
 * {
 *   model,
 *   usage: { prompt_tokens, completion_tokens, total_tokens },
 *   choices: [{ message: { content } }],
 *   llmRaw: <raw responses payload>
 * }
 */
export async function callLLM(
  messages: ChatMessage[],
  model: string,
  opts: CallOpts = {}
) {
  const apiKey = env("OPENAI_API_KEY");
  const body = {
    model,
    input: buildInput(messages),
    // Responses API uses `max_output_tokens`
    max_output_tokens: opts.max ?? opts.maxTokens ?? undefined,
    temperature: typeof opts.temperature === "number" ? opts.temperature : 0.4,
    // DO NOT set `response_format` or `text.format` — causes 400s on some SDKs.
  };

  const resp = await fetchWithTimeout("https://api.openai.com/v1/responses", {
    method: "POST",
    timeoutMs: opts.timeoutMs ?? 55_000,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      // Keep the default org/project via headers env if configured in account;
      // no need to set here.
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    const info = `${resp.status} ${resp.statusText} :: ${errText}`;
    throw Object.assign(new Error(info), { status: resp.status });
  }

  const json = (await resp.json()) as RawResponsesResult;

  const text = extractText(json);
  const usage = normalizeUsage(json.usage);
  const normalized = {
    model: json.model ?? model,
    usage: {
      total_tokens: usage.total_tokens,
      prompt_tokens: usage.prompt_tokens,
      completion_tokens: usage.completion_tokens,
    },
    choices: [
      {
        message: { content: text },
      },
    ],
    llmRaw: json,
  };

  return normalized;
}

// For legacy imports in your codebase
export { callLLM as callOpenAI };
export default callLLM;
