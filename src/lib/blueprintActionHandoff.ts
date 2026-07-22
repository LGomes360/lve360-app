import "server-only";

import type { NextRequest } from "next/server";

import { buildBlueprintActionCandidates } from "./blueprintActions";
import { parseBlueprintReport } from "./blueprintReport";
import { getSupabaseAdmin } from "./supabaseAdmin";

export const BLUEPRINT_ACTION_COOKIE = "lve360_blueprint_action";
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type HandoffPointer = { stackId: string; actionId: string };

export function encodePointer(pointer: HandoffPointer): string {
  return Buffer.from(JSON.stringify(pointer), "utf8").toString("base64url");
}

export function decodePointer(raw: string | undefined): HandoffPointer | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Partial<HandoffPointer>;
    if (!parsed.stackId || !UUID_RE.test(parsed.stackId) || !parsed.actionId || parsed.actionId.length > 80) return null;
    return { stackId: parsed.stackId, actionId: parsed.actionId };
  } catch {
    return null;
  }
}

function markdownFromStack(stack: { sections: unknown; summary: string | null }): string {
  const sections = stack.sections;
  if (sections && typeof sections === "object" && "markdown" in sections) {
    const markdown = (sections as { markdown?: unknown }).markdown;
    if (typeof markdown === "string") return markdown;
  }
  return stack.summary ?? "";
}

export async function resolveBlueprintActionPointer(pointer: HandoffPointer) {
  const { data: stack, error } = await getSupabaseAdmin()
    .from("stacks")
    .select("id, sections, summary")
    .eq("id", pointer.stackId)
    .maybeSingle();

  if (error) throw error;
  if (!stack) return null;

  const report = parseBlueprintReport(markdownFromStack(stack));
  const selected = buildBlueprintActionCandidates(report).find((candidate) => candidate.id === pointer.actionId) ?? null;
  return selected ? { pointer, selected } : null;
}

export async function resolveBlueprintActionFromRequest(req: NextRequest) {
  const pointer = decodePointer(req.cookies.get(BLUEPRINT_ACTION_COOKIE)?.value);
  return pointer ? resolveBlueprintActionPointer(pointer) : null;
}
