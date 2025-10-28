/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/consistent-type-imports */
// ---------------------------------------------------------------------------
// LVE360 — src/lib/openai.ts  (Responses API wrapper, no temperature)
//  • Accepts ChatGPT-style messages [{role, content}]
//  • Calls Responses API with input[{type:"input_text"}]
//  • Uses max_output_tokens (optional) and a 55s timeout
//  • Normalizes output to Chat Completions-like shape your code expects:
//      { model, usage:{prompt_tokens, completion_tokens, total_tokens},
//        choices:[{ message:{ content } }] }
// ---------------------------------------------------------------------------

type Role = "system" | "user" | "assistant";

export type ChatMessage = {
  role: Role;
  content: string;
};

type CallOpts = {
  max?: number;          // preferred (normalized to max_output_tokens)
  maxTokens?: number;    // alias
  timeoutMs?: number;    // default 55_000
};

type RawUsage = {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  // Back-compat fields we’ll fill:
  prompt_tokens?: number;
  completion_tokens?: number;
};

type RawResult = {
  id?: string;
  model?: string;
  output_text?: string;
  output?: Array<{
    role?: string;
    type?: string;
    content?: Array<{ type: string; text?: string }>;
  }>;
  usage?: RawUsage;
};

function env(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`${key} is not set`);
  return v;
}

function buildInput(messages: ChatMessage[]) {
  // Responses API input format
  return messages.map((m) => ({
    role: m.role,
    content: [
      {
        type: "input_text",
        text: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
      },
    ],
  }));
}

function extractText(json: RawResult): string {
  if (json.output_text && json.output_text.trim()) return json.output_text.trim();
  const pieces =
    json.output?.flatMap(({ content = [] }) =>
      content
        .filter((c) => c?.type === "output_text" && typeof c.text === "string")
        .map((c) => c.text as string)
    ) ?? [];
  return pieces.join("\n").trim();
}

function normalizeUsage(u?: RawUsage) {
  const input = u?.input_tokens ?? u?.prompt_tokens ?? 0;
  const output = u?.output_tokens ?? u?.completion_tokens ?? 0;
  const total = u?.total_tokens ?? input + output;
  return {
    total_tokens: total,
    prompt_tokens: input,
    completion_tokens: output,
  };
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {}
) {
  const { timeoutMs = 55_000, ...rest } = init;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...rest, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

/**
 * callLLM(messages, model, { max?, maxTokens?, timeoutMs? })
 */
export async function callLLM(
  messages: ChatMessage[],
  model: string,
  opts: CallOpts = {}
) {
  const apiKey = env("OPENAI_API_KEY");

  // IMPORTANT: Do NOT send temperature (these models reject it).
  const body: Record<string, any> = {
    model,
    input: buildInput(messages),
  };
  const max = opts.max ?? opts.maxTokens;
  if (typeof max === "number") body.max_output_tokens = max;

  const res = await fetchWithTimeout("https://api.openai.com/v1/responses", {
    method: "POST",
    timeoutMs: opts.timeoutMs ?? 55_000,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    const msg = `${res.status} ${res.statusText} :: ${errText}`;
    const err: any = new Error(msg);
    err.status = res.status;
    throw err;
  }

  const json = (await res.json()) as RawResult;
  const text = extractText(json);
  const usage = normalizeUsage(json.usage);

  // Return a Chat Completions-like envelope for compatibility
  return {
    model: json.model ?? model,
    usage,
    choices: [{ message: { content: text } }],
    llmRaw: json,
  };
}

// Legacy named export compatibility
export { callLLM as callOpenAI };
export default callLLM;
