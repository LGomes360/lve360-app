/* eslint-disable no-console */
// ---------------------------------------------------------------------------
// OpenAI unified wrapper
// - GPT-5* => Responses API (input[...] with input_text, max_output_tokens)
// - GPT-4* (4o, 4.1, etc.) => Chat Completions
// - Flexible call signature and normalized return shape
// ---------------------------------------------------------------------------

import OpenAI from "openai";

export type ChatMsg = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
};

export type CallOpts = {
  max?: number;        // alias for maxTokens
  maxTokens?: number;  // preferred
  temperature?: number;
  timeoutMs?: number;  // default 60s
};

export type NormalizedLLMResponse = {
  model: string;
  usage?: {
    total_tokens?: number | null;
    prompt_tokens?: number | null;
    completion_tokens?: number | null;
  };
  text: string;        // <- always the final text here
  __raw?: unknown;     // raw SDK response for debugging
};

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// --- Model routing ----------------------------------------------------------
function isResponsesFamily(model: string) {
  // All GPT-5 variants should use Responses API
  return /^gpt-5/i.test(model);
}

function resolveMax(opts?: CallOpts): number | undefined {
  const v = typeof opts?.max === "number" ? opts!.max : opts?.maxTokens;
  return typeof v === "number" ? v : undefined;
}

function clampMaxForResponses(v?: number) {
  // Responses API requires max_output_tokens >= 16 if provided
  if (typeof v !== "number") return undefined;
  return Math.max(16, v);
}

function msgsToResponsesInput(msgs: ChatMsg[]) {
  // Map 'tool' to 'assistant' to keep roles valid
  return msgs.map((m) => ({
    role: m.role === "tool" ? "assistant" : m.role,
    content: [{ type: "input_text", text: m.content }],
  }));
}

function msgsToChat(messages: ChatMsg[]) {
  // Map 'tool' to 'assistant' (no tool_call_id)
  return messages.map((m) =>
    m.role === "tool"
      ? ({ role: "assistant", content: m.content } as any)
      : ({ role: m.role, content: m.content } as any)
  );
}

function pickTextFromResponses(raw: any): string {
  if (typeof raw?.output_text === "string") return raw.output_text.trim();

  const gather = (arr: any[]) =>
    (arr || [])
      .map((seg: any) => {
        if (typeof seg?.text === "string") return seg.text;
        if (typeof seg?.content === "string") return seg.content;
        return "";
      })
      .filter(Boolean)
      .join("");

  const a = gather(raw?.output);
  if (a) return a.trim();
  const b = gather(raw?.content);
  if (b) return b.trim();
  return "";
}

function usageFromResponses(raw: any) {
  const input = raw?.usage?.input_tokens ?? raw?.usage?.prompt_tokens ?? null;
  const output = raw?.usage?.output_tokens ?? raw?.usage?.completion_tokens ?? null;
  const total =
    raw?.usage?.total_tokens ??
    (typeof input === "number" && typeof output === "number" ? input + output : null);
  return input || output || total
    ? { total_tokens: total, prompt_tokens: input, completion_tokens: output }
    : undefined;
}

function usageFromChat(raw: any) {
  const u = raw?.usage;
  if (!u) return undefined;
  return {
    total_tokens: u.total_tokens ?? null,
    prompt_tokens: u.prompt_tokens ?? null,
    completion_tokens: u.completion_tokens ?? null,
  };
}

function withTimeout<T>(ms: number | undefined, p: Promise<T>): Promise<T> {
  if (!ms || ms <= 0) return p;
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`OpenAI call timed out after ${ms} ms`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); })
     .catch((e) => { clearTimeout(t); reject(e); });
  });
}

// --- Public: forgiving call signature --------------------------------------
// Overloads for nice DX
export async function callOpenAI(
  model: string,
  messagesOrString: ChatMsg[] | string,
  opts?: CallOpts
): Promise<NormalizedLLMResponse>;
export async function callOpenAI(
  messagesOrString: ChatMsg[] | string,
  model: string,
  opts?: CallOpts
): Promise<NormalizedLLMResponse>;
export async function callOpenAI(
  a: string | ChatMsg[] ,
  b: string | ChatMsg[],
  c: CallOpts = {}
): Promise<NormalizedLLMResponse> {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY missing");

  // Normalize the flexible signature
  let model: string;
  let messagesOrString: ChatMsg[] | string;
  let opts = c;

  if (typeof a === "string" && Array.isArray(b)) {
    // (model, messages)
    model = a;
    messagesOrString = b;
  } else if (typeof a === "string" && typeof b !== "string") {
    // (model, string|msgs) thanks to ts's union, but above already caught arrays
    model = a;
    messagesOrString = b as any;
  } else if (Array.isArray(a) && typeof b === "string") {
    // (messages, model)
    model = b;
    messagesOrString = a;
  } else if (typeof a !== "string" && typeof b === "string") {
    // (string|msgs, model)
    model = b;
    messagesOrString = a as any;
  } else {
    // Fallback: assume (model, promptString)
    model = String(a);
    messagesOrString = String(b ?? "");
  }

  const msgs: ChatMsg[] = Array.isArray(messagesOrString)
    ? messagesOrString
    : [{ role: "user", content: String(messagesOrString) }];

  const timeoutMs = opts.timeoutMs ?? 60_000;

  if (isResponsesFamily(model)) {
    // GPT-5 path: Responses API
    const body: any = {
      model,
      // IMPORTANT: use 'input' with input_text blocks
      input: msgsToResponsesInput(msgs),
    };

    // max_output_tokens must be >= 16 if provided
    const max = clampMaxForResponses(resolveMax(opts));
    if (typeof max === "number") body.max_output_tokens = max;

    // Most gpt-5 variants ignore temperature; safe to omit unless explicitly supported
    if (typeof opts.temperature === "number") {
      // Only set if not rejected by your account; harmless to omit
      body.temperature = opts.temperature;
    }

    const resp = await withTimeout(timeoutMs, client.responses.create(body));
    const text = pickTextFromResponses(resp);
    const usage = usageFromResponses(resp);

    return {
      model: (resp as any)?.model ?? model,
      usage,
      text,
      __raw: resp,
    };
  }

  // GPT-4 family path: Chat Completions
  const chatBody: any = {
    model,
    messages: msgsToChat(msgs),
  };

  const maxTokens = resolveMax(opts);
  if (typeof maxTokens === "number") chatBody.max_tokens = maxTokens;
  if (typeof opts.temperature === "number") chatBody.temperature = opts.temperature;

  const resp = await withTimeout(timeoutMs, client.chat.completions.create(chatBody));
  const text = (resp?.choices?.[0]?.message?.content ?? "").trim();
  const usage = usageFromChat(resp);

  return {
    model: (resp as any)?.model ?? model,
    usage,
    text,
    __raw: resp,
  };
}

// A tiny helper some files prefer to import
export type { NormalizedLLMResponse as LLMResult };
