/**
 * Extract only member-facing text from an OpenAI Responses API payload.
 * Internal response IDs, reasoning metadata, status strings, and request echoes
 * must never become visible product copy.
 */
export function extractResponsesText(response: unknown): string {
  if (!response || typeof response !== "object") return "";
  const root = response as Record<string, unknown>;
  if (typeof root.output_text === "string" && root.output_text.trim()) {
    return root.output_text.trim();
  }

  const parts: string[] = [];
  const seen = new Set<unknown>();

  function take(value: unknown) {
    if (typeof value !== "string") return;
    const text = value.trim();
    if (text) parts.push(text);
  }

  function visit(node: unknown) {
    if (!node || typeof node !== "object" || seen.has(node)) return;
    seen.add(node);

    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }

    const item = node as Record<string, unknown>;
    if (item.type === "output_text") {
      take(item.text);
      return;
    }
    if (typeof item.output_text === "string") take(item.output_text);

    // The Responses API nests output_text blocks beneath message content.
    if (item.type === "message" || Array.isArray(item.content)) visit(item.content);
    if (Array.isArray(item.output)) visit(item.output);
  }

  visit(root.output);
  return parts.join("\n").trim();
}
