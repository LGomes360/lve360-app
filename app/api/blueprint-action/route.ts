import { NextResponse, type NextRequest } from "next/server";

import {
  BLUEPRINT_ACTION_COOKIE,
  UUID_RE,
  encodePointer,
  resolveBlueprintActionFromRequest,
  resolveBlueprintActionPointer,
} from "@/lib/blueprintActionHandoff";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function GET(req: NextRequest) {
  try {
    const resolved = await resolveBlueprintActionFromRequest(req);
    const selected = resolved?.selected ?? null;
    if (!selected || selected.kind !== "lifestyle") {
      const response = NextResponse.json({ ok: true, selected: null });
      response.cookies.delete(BLUEPRINT_ACTION_COOKIE);
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
    const selected = (await resolveBlueprintActionPointer(pointer))?.selected ?? null;
    if (!selected) return NextResponse.json({ ok: false, error: "action_not_found" }, { status: 404 });
    if (selected.kind !== "lifestyle") {
      return NextResponse.json({ ok: false, error: "action_requires_review" }, { status: 422 });
    }

    const response = NextResponse.json({ ok: true, selected });
    response.cookies.set(BLUEPRINT_ACTION_COOKIE, encodePointer(pointer), {
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
  response.cookies.delete(BLUEPRINT_ACTION_COOKIE);
  return response;
}
