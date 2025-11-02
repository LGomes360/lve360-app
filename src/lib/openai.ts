/* eslint-disable no-console */
/**
 * ANCHOR: OPENAI_UNIFIED_WRAPPER_V4
 * Unified OpenAI wrapper:
 * - gpt-5* => Responses API (instructions + input_text, max_output_tokens >= 16)
 * - others => Chat Completions API (messages)
 * Normalizes to: { model, modelUsed, text, usage, __raw }
 */

import OpenAI from "openai";

export type ChatMsg = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
};

export type CallOpts = {
  maxTokens?: number;     // alias for output tokens (min 16 on gpt-5*)
  max?: number;           // alias; same meaning as maxTokens
  temperature?: number;   // ignored for gpt-5*
  timeoutMs?: number;     // default 60s
};

export type NormalizedLLMResponse = {
  model: string;
  modelUsed?: string;
  text: string;
  usage?: {
    total_tokens?: number | null;
    prompt_tokens?: number | null;
    completion_tokens?: number | null;
  };
  __raw?: unknown;
};

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function isResponsesModel(m: string) {
  return m.toLowerCase().startsWith("gpt-5");
}

function pickMaxTokens(opts?: CallOpts) {
  const v = typeof opts?.maxTokens === "number" ? opts!.maxTokens : opts?.max;
  return typeof v === "number" ? v : undefined;
}
function clampMinOutputTokens(v: number | undefined, min = 16) {
  if (!v || typeof v !== "number") return min;
  return v < min ? min : v;
}

/** Build a Responses API body. */
function toResponsesPayload(model: string, messages: ChatMsg[], opts?: CallOpts) {
  const want = clampMinOutputTokens(pickMaxTokens(opts) ?? 256, 16);

  // If it’s a simple single-user prompt with no system/assistant,
  // prefer the simplest acceptable shape (some gateways are picky).
  const onlyUser = messages.every(m => m.role === "user");
  const hasSystem = messages.some(m => m.role === "system");
  const hasAssistant = messages.some(m => m.role === "assistant");

  if (onlyUser && !hasSystem && !hasAssistant && messages.length === 1) {
    return {
      model,
      input: [
        {
          role: "user",
          content: [{ type: "input_text", text: messages[0].content }],
        },
      ],
      max_output_tokens: want,
    } as any;
  }

  // General case: collect system => instructions, others => input blocks
  let instructions = "";
  const inputBlocks: Array<{
    role: "user" | "assistant";
    content: Array<{ type: "input_text"; text: string }>;
  }> = [];

  for (const m of messages) {
    if (m.role === "system") {
      instructions += (instructions ? "\n" : "") + m.content;
    } else {
      const role = m.role === "assistant" ? "assistant" : "user";
      inputBlocks.push({
        role,
        content: [{ type: "input_text", text: m.content }],
      });
    }
  }

  const body: any = {
    model,
    input:
      inputBlocks.length > 0
        ? inputBlocks
        : [{ role: "user", content: [{ type: "input_text", text: "" }]}],
    max_output_tokens: want,
  };
  if (instructions.trim()) body.instructions = instructions.trim();
  return body;
}

/** Robust text extractor for the Responses API (handles many shapes). */
function extractResponsesText(resp: any): string {
  // 1) Common direct field
  if (typeof resp?.output_text === "string" && resp.output_text.trim()) {
    return resp.output_text.trim();
  }

  // 2) Walk output blocks: output[*].content[*].{type,text,refusal}
  const fromOutputBlocks = (() => {
    const out = resp?.output;
    if (!Array.isArray(out)) return "";
    const pieces: string[] = [];
    for (const block of out) {
      const content = block?.content;
      if (!Array.isArray(content)) continue;
      for (const seg of content) {
        // Prefer explicit output_text; fall back to text; include refusal if present
        if (typeof seg?.text === "string") pieces.push(seg.text);
        else if (typeof seg?.output_text === "string") pieces.push(seg.output_text);
        else if (typeof seg?.refusal === "string") pieces.push(seg.refusal);
        else if (seg && typeof seg === "object") {
          // Some SDKs nest text under different keys
          if (typeof seg?.content === "string") pieces.push(seg.content);
          if (Array.isArray(seg?.content)) {
            for (const inner of seg.content) {
              if (typeof inner?.text === "string") pieces.push(inner.text);
              if (typeof inner?.output_text === "string") pieces.push(inner.output_text);
            }
          }
        }
      }
    }
    return pieces.join("").trim();
  })();
  if (fromOutputBlocks) return fromOutputBlocks;

  // 3) Older/alt shapes
  if (typeof resp?.content === "string" && resp.content.trim()) return resp.content.trim();

  // 4) Rare gateway-normalized shape (choices like chat)
  if (Array.isArray(resp?.choices) && resp.choices[0]?.message?.content) {
    const t = String(resp.choices[0].message.content).trim();
    if (t) return t;
  }

  return "";
}

function usageFromResponses(resp: any) {
  const u = resp?.usage || {};
  const input = u.input_tokens ?? u.prompt_tokens ?? null;
  const output = u.output_tokens ?? u.completion_tokens ?? null;
  const total = u.total_tokens ?? (input != null && output != null ? input + output : null);
  return input != null || output != null || total != null
    ? { total_tokens: total, prompt_tokens: input, completion_tokens: output }
    : undefined;
}

/** For Chat Completions (GPT-4 family). */
function toChatMessages(messages: ChatMsg[]) {
  // Map 'tool' -> 'assistant' string content to satisfy the SDK union
  return messages.map((m) =>
    m.role === "tool"
      ? ({ role: "assistant", content: m.content } as any)
      : ({ role: m.role, content: m.content } as any)
  );
}
function usageFromChat(resp: any) {
  const u = resp?.usage;
  if (!u) return undefined;
  return {
    total_tokens: u.total_tokens ?? null,
    prompt_tokens: u.prompt_tokens ?? null,
    completion_tokens: u.completion_tokens ?? null,
  };
}

/** Canonical wrapper used everywhere. */
export async function callOpenAI(
  model: string,
  messagesOrString: ChatMsg[] | string,
  opts: CallOpts = {}
): Promise<NormalizedLLMResponse> {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY missing");

  const messages: ChatMsg[] = Array.isArray(messagesOrString)
    ? messagesOrString
    : [{ role: "user", content: String(messagesOrString) }];

  const timeoutMs = opts.timeoutMs ?? 60_000;

  if (isResponsesModel(model)) {
    const body = toResponsesPayload(model, messages, opts);
    const resp = await new Promise<any>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`OpenAI Responses timeout after ${timeoutMs} ms`)), timeoutMs);
      client.responses.create(body).then((r) => { clearTimeout(t); resolve(r); })
        .catch((e) => { clearTimeout(t); reject(e); });
    });

    const text = extractResponsesText(resp);
    return {
      model: (resp as any)?.model ?? model,
      modelUsed: (resp as any)?.model ?? model,
      text,
      usage: usageFromResponses(resp),
      __raw: resp,
    };
  }

  // Chat Completions path (GPT-4 family, etc.)
  const chatBody: any = {
    model,
    messages: toChatMessages(messages),
  };
  const maxT = pickMaxTokens(opts);
  if (typeof maxT === "number") chatBody.max_tokens = maxT;
  if (typeof opts.temperature === "number") chatBody.temperature = opts.temperature;

  const resp = await new Promise<any>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`OpenAI Chat timeout after ${timeoutMs} ms`)), timeoutMs);
    client.chat.completions.create(chatBody).then((r) => { clearTimeout(t); resolve(r); })
      .catch((e) => { clearTimeout(t); reject(e); });
  });

  const text = (resp?.choices?.[0]?.message?.content ?? "").trim();
  return {
    model: (resp as any)?.model ?? model,
    modelUsed: (resp as any)?.model ?? model,
    text,
    usage: usageFromChat(resp),
    __raw: resp,
  };
}

// Back-compat type alias
export type LLMResult = NormalizedLLMResponse;
