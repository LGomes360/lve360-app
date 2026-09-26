import { NextResponse } from "next/server";

import { loadLatestHealthContextHandoff } from "@/lib/healthContextHandoffData";
import { supabaseRoute } from "@/lib/supabase";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = supabaseRoute();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const handoff = await loadLatestHealthContextHandoff(supabase, user.id);
  return NextResponse.json({ ok: true, handoff }, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(request: Request) {
  const supabase = supabaseRoute();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null) as { id?: unknown } | null;
  if (typeof body?.id !== "string" || !UUID_PATTERN.test(body.id)) {
    return NextResponse.json({ ok: false, error: "invalid_handoff" }, { status: 400 });
  }

  const { error } = await supabase
    .from("health_context_handoffs")
    .delete()
    .eq("id", body.id)
    .eq("user_id", user.id);
  if (error) {
    console.error("[health-context-handoff] delete failed", error.message);
    return NextResponse.json({ ok: false, error: "delete_failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
