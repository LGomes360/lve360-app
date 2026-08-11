import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { getOrCreateTodayBrief } from "@/lib/ai/todayBriefData";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { parseLocalDate } from "@/lib/today";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const BRIEF_ACTIONS = ["useful", "not_useful", "remind_later", "opened_routine", "completed"] as const;
type BriefAction = (typeof BRIEF_ACTIONS)[number];

async function requirePaidUser() {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user?.id) return { error: "unauthorized" as const, user: null };

  const { data: profile } = await getSupabaseAdmin()
    .from("users")
    .select("tier")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.tier !== "premium" && profile?.tier !== "trial") {
    return { error: "premium_required" as const, user: null };
  }
  return { error: null, user };
}

function authErrorResponse(error: "unauthorized" | "premium_required") {
  return NextResponse.json({ ok: false, error }, { status: error === "unauthorized" ? 401 : 403 });
}

function isBriefAction(value: unknown): value is BriefAction {
  return typeof value === "string" && BRIEF_ACTIONS.includes(value as BriefAction);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requirePaidUser();
    if (auth.error || !auth.user) return authErrorResponse(auth.error ?? "unauthorized");

    const localDate = parseLocalDate(req.nextUrl.searchParams.get("date"));
    if (!localDate) return NextResponse.json({ ok: false, error: "invalid_local_date" }, { status: 400 });

    const brief = await getOrCreateTodayBrief(auth.user.id, localDate);
    return NextResponse.json({ ok: true, brief });
  } catch (error) {
    console.error("[today-brief] load failed", error);
    return NextResponse.json({ ok: false, error: "today_brief_unavailable" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requirePaidUser();
    if (auth.error || !auth.user) return authErrorResponse(auth.error ?? "unauthorized");

    const body = await req.json().catch(() => null);
    if (!isUuid(body?.briefId) || !isBriefAction(body?.action)) {
      return NextResponse.json({ ok: false, error: "invalid_brief_action" }, { status: 400 });
    }

    const now = new Date();
    const updates: Record<string, unknown> = { updated_at: now.toISOString() };
    if (body.action === "useful") updates.feedback = "useful";
    if (body.action === "not_useful") {
      updates.feedback = "not_useful";
      updates.action_state = "dismissed";
    }
    if (body.action === "remind_later") {
      updates.action_state = "remind_later";
      updates.remind_after = new Date(now.getTime() + 3 * 60 * 60 * 1000).toISOString();
    }
    if (body.action === "opened_routine") updates.action_state = "opened_routine";
    if (body.action === "completed") updates.action_state = "completed";

    const { data, error } = await getSupabaseAdmin()
      .from("ai_today_briefs")
      .update(updates)
      .eq("id", body.briefId)
      .eq("user_id", auth.user.id)
      .select("id,feedback,action_state,remind_after")
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ ok: false, error: "brief_not_found" }, { status: 404 });

    return NextResponse.json({ ok: true, state: data });
  } catch (error) {
    console.error("[today-brief] action failed", error);
    return NextResponse.json({ ok: false, error: "today_brief_action_failed" }, { status: 500 });
  }
}
