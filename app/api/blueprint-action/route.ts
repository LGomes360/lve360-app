import { NextResponse, type NextRequest } from "next/server";

import { buildBlueprintActionCandidates } from "@/lib/blueprintActions";
import { parseBlueprintReport } from "@/lib/blueprintReport";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const COOKIE_NAME = "lve360_blueprint_action";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type HandoffPointer = { stackId: string; actionId: string };

function encodePointer(pointer: HandoffPointer): string {
  return Buffer.from(JSON.stringify(pointer), "utf8").toString("base64url");
}

function decodePointer(raw: string | undefined): HandoffPointer | null {
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

async function resolvePointer(pointer: HandoffPointer) {
  const { data: stack, error } = await supabaseAdmin
    .from("stacks")
    .select("id, sections, summary")
    .eq("id", pointer.stackId)
    .maybeSingle();

  if (error) throw error;
  if (!stack) return null;

  const report = parseBlueprintReport(markdownFromStack(stack));
  return buildBlueprintActionCandidates(report).find((candidate) => candidate.id === pointer.actionId) ?? null;
}

export async function GET(req: NextRequest) {
  try {
    const pointer = decodePointer(req.cookies.get(COOKIE_NAME)?.value);
    if (!pointer) return NextResponse.json({ ok: true, selected: null });
    const selected = await resolvePointer(pointer);
    if (!selected || selected.kind !== "lifestyle") {
      const response = NextResponse.json({ ok: true, selected: null });
      response.cookies.delete(COOKIE_NAME);
      return response;
    }
    return NextResponse.json({ ok: true, selected });
  } catch (error) {
    console.error("[blueprint-action] resolve failed", error);
    return NextResponse.json({ ok: false, error: "handoff_unavailable" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as { stack_id?: string; action_id?: string } | null;
    if (!body?.stack_id || !UUID_RE.test(body.stack_id) || !body.action_id || body.action_id.length > 80) {
      return NextResponse.json({ ok: false, error: "invalid_action" }, { status: 400 });
    }

    const pointer = { stackId: body.stack_id, actionId: body.action_id };
    const selected = await resolvePointer(pointer);
    if (!selected) return NextResponse.json({ ok: false, error: "action_not_found" }, { status: 404 });
    if (selected.kind !== "lifestyle") {
      return NextResponse.json({ ok: false, error: "action_requires_review" }, { status: 422 });
    }

    const response = NextResponse.json({ ok: true, selected });
    response.cookies.set(COOKIE_NAME, encodePointer(pointer), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return response;
  } catch (error) {
    console.error("[blueprint-action] save failed", error);
    return NextResponse.json({ ok: false, error: "handoff_unavailable" }, { status: 500 });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(COOKIE_NAME);
  return response;
}
