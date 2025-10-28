/* eslint-disable no-console */
// -----------------------------------------------------------------------------
// src/lib/openai.ts
// Unified OpenAI wrapper (Responses API for gpt-5*; Chat Completions for legacy)
// Normalized return: { model, usage:{...}, choices:[{ message:{ content } }], llmRaw }
// Call signature used by generateStack.ts: callLLM(messages, model, { max?, maxTokens?, temperature? })
//
// Notes:
// - For gpt-5* we convert Chat-like messages -> Responses `input` content.
// - We DO NOT send temperature to gpt-5* models (API rejects it).
// - We DO set max tokens appropriately (max_output_tokens vs max_tokens).
// -----------------------------------------------------------------------------

import OpenAI from "openai";

export type CallOpts = {
  max?: number;           // preferred; normalized to max_output_tokens (Responses) or max_tokens (Chat)
  maxTokens?: number;     // alias
  timeoutMs?: number;     // default 55_000
  temperature?: number;   // ignored for gpt-5* (Responses API rejects it); allowed for Chat Completions
};

// Minimal message type compatible with your call sites
export type ChatMsg = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
};

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// --- Helpers ----------------------------------------------------------------

function isFiveSeries(model: string) {
  return /^gpt-5/i.test(model);
}

function pickMaxTokens(opts?: CallOpts) {
  if (!opts) return undefined;
  return typeof opts.max === "number" ? opts.max
       : typeof opts.maxTokens === "number" ? opts.maxTokens
       : undefined;
}

function messagesToResponsesInput(messages: ChatMsg[]) {
  // Combine all system messages into one `instructions` string;
  // others become `input` items with structured content blocks.
  const systemText = messages
    .filter(m => m.role === "system")
    .map(m => (m.content ?? "")).join("\n");

  const input = messages
    .filter(m => m.role !== "system")
    .map(m => ({
      role: m.role,
      // Each message must be an array of typed content parts.
      // Use "input_text" for user/assistant Tool-less text.
      content: [{ type: "input_text" as const, text: String(m.content ?? "") }],
    }));

  return { instructions: systemText || undefined, input };
}

// Normalize Responses API result to chat-like shape
function normalizeResponsesResult(model: string, r: any) {
  // SDK v4 exposes `r.output_text` for convenience. Fall back to scanning `r.output`.
  let text = "";
  if (typeof r?.output_text === "string") {
    text = r.output_text;
  } else if (Array.isArray(r?.output)) {
    // Collect any "output_text" items, otherwise flatten text-like content
    const collected: string[] = [];
    for (const part of r.output) {
      // Each part might be like: { type: "output_text", text: "..." }
      if (typeof part?.text === "string") collected.push(part.text);
      // Some SDKs use nested content; keep defensive.
      else if (typeof part?.content === "string") collected.push(part.content);
    }
    text = collected.join("");
  }

  const usage = r?.usage
    ? {
        total_tokens: r.usage.total_tokens ?? undefined,
        prompt_tokens: r.usage.input_tokens ?? r.usage.prompt_tokens ?? undefined,
        completion_tokens: r.usage.output_tokens ?? r.usage.completion_tokens ?? undefined,
      }
    : undefined;

  return {
    model,
    usage,
    choices: [
      { message: { content: (text || "").trim() } }
    ],
    llmRaw: r,
  };
}

// Normalize Chat Completions result to same shape
function normalizeChatResult(r: any) {
  return {
    model: r?.model,
    usage: r?.usage ? {
      total_tokens: r.usage.total_tokens,
      prompt_tokens: r.usage.prompt_tokens,
      completion_tokens: r.usage.completion_tokens,
    } : undefined,
    choices: r?.choices ?? [],
    llmRaw: r,
  };
}

// Abort helper for timeouts
function withTimeout<T>(ms: number, promise: Promise<T>): Promise<T> {
  if (!ms || ms <= 0) return promise;
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  // @ts-expect-error: we attach signal only where supported below
  (promise as any).signal = ac.signal;
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`OpenAI call timed out after ${ms} ms`)), ms);
    }),
  ]).finally(() => clearTimeout(t));
}

// --- Public API -------------------------------------------------------------

export async function callLLM(
  messages: ChatMsg[],
  model: string,
  opts: CallOpts = {}
) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  const timeoutMs = typeof opts.timeoutMs === "number" ? opts.timeoutMs : 55_000;
  const max = pickMaxTokens(opts);

  if (isFiveSeries(model)) {
    // ---- GPT-5 family -> Responses API ----
    const { instructions, input } = messagesToResponsesInput(messages);

    // Build body WITHOUT temperature / response_format / text.format
    const body: OpenAI.Responses.CreateParams = {
      model,
      input,               // [{ role, content:[{type:"input_text", text}]}]
      ...(instructions ? { instructions } : {}),
      ...(typeof max === "number" ? { max_output_tokens: max } : {}),
    };

    try {
      const p = client.responses.create(body);
      const res = await withTimeout(timeoutMs, p);
      return normalizeResponsesResult(model, res);
    } catch (err) {
      // Surface the API error just like SDK does
      throw err;
    }
  } else {
    // ---- Legacy Chat Completions ----
    const body: OpenAI.Chat.Completions.ChatCompletionCreateParams = {
      model,
      messages: messages as any, // your callers pass compatible shapes
      ...(typeof max === "number" ? { max_tokens: max } : {}),
      ...(typeof opts.temperature === "number" ? { temperature: opts.temperature } : {}),
    };

    try {
      const p = client.chat.completions.create(body);
      const res = await withTimeout(timeoutMs, p);
      return normalizeChatResult(res);
    } catch (err) {
      throw err;
    }
  }
}

export default { callLLM };
