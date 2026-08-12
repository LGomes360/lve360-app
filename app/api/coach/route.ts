import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { buildCoachContext, generateCoachAnswer } from "@/lib/ai/contextualCoachData";
import {
  COACH_PROMPT_VERSION,
  cleanCoachQuestion,
  coachBoundaryAnswer,
  coachPageFromPath,
  coachSafetyBoundary,
  isCoachFeedback,
  type CoachSource,
  type CoachTurn,
} from "@/lib/contextualCoach";
import { coachBudget } from "@/lib/contextualCoachBudget";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

async function requirePaidUser() {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user?.id) return { error: "unauthorized" as const, user: null };
  const { data: profile, error: profileError } = await getSupabaseAdmin()
    .from("users").select("tier").eq("id", user.id).maybeSingle();
  if (profileError) throw profileError;
  if (profile?.tier !== "premium" && profile?.tier !== "trial") {
    return { error: "premium_required" as const, user: null };
  }
  return { error: null, user };
}

function authResponse(error: "unauthorized" | "premium_required") {
  return NextResponse.json({ ok: false, error }, { status: error === "unauthorized" ? 401 : 403 });
}

function monthStart() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

async function usage(userId: string) {
  const admin = getSupabaseAdmin();
  const since = monthStart();
  const [turnResult, costResult] = await Promise.all([
    admin.from("ai_coaching_turns").select("id", { count: "exact", head: true })
      .eq("user_id", userId).gte("created_at", since),
    admin.from("ai_generation_ledger").select("estimated_cost_usd")
      .eq("user_id", userId).eq("task", "contextual_coach").gte("created_at", since),
  ]);
  if (turnResult.error) throw turnResult.error;
  if (costResult.error) throw costResult.error;
  const estimatedCostUsd = (costResult.data ?? []).reduce((sum, item) => sum + Number(item.estimated_cost_usd ?? 0), 0);
  return { turns: turnResult.count ?? 0, estimatedCostUsd, limit: coachBudget() };
}

async function saveTurn(userId: string, values: Record<string, unknown>) {
  const { data, error } = await getSupabaseAdmin().from("ai_coaching_turns")
    .insert({ user_id: userId, prompt_version: COACH_PROMPT_VERSION, ...values })
    .select("id,page_context,question,answer,response_source,generation_status,source_refs,feedback,created_at")
    .single();
  if (error) throw error;
  return data as CoachTurn;
}

export async function GET() {
  try {
    const auth = await requirePaidUser();
    if (auth.error || !auth.user) return authResponse(auth.error ?? "unauthorized");
    const admin = getSupabaseAdmin();
    const [{ data, error }, currentUsage] = await Promise.all([
      admin.from("ai_coaching_turns")
        .select("id,page_context,question,answer,response_source,generation_status,source_refs,feedback,created_at")
        .eq("user_id", auth.user.id).neq("generation_status", "pending")
        .order("created_at", { ascending: false }).limit(8),
      usage(auth.user.id),
    ]);
    if (error) throw error;
    return NextResponse.json({ ok: true, turns: (data ?? []) as CoachTurn[], usage: currentUsage });
  } catch (error) {
    console.error("[coach] load failed", error);
    return NextResponse.json({ ok: false, error: "coach_unavailable" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requirePaidUser();
    if (auth.error || !auth.user) return authResponse(auth.error ?? "unauthorized");
    const body = await req.json().catch(() => null);
    const question = cleanCoachQuestion(body?.question);
    if (!question) return NextResponse.json({ ok: false, error: "invalid_question" }, { status: 400 });
    const page = coachPageFromPath(body?.pathname);
    const boundary = coachSafetyBoundary(question);
    if (boundary) {
      const turn = await saveTurn(auth.user.id, {
        page_context: page,
        question,
        answer: coachBoundaryAnswer(boundary),
        response_source: "safety",
        generation_status: "blocked",
        source_refs: [],
      });
      return NextResponse.json({ ok: true, turn, usage: await usage(auth.user.id) });
    }

    const currentUsage = await usage(auth.user.id);
    if (currentUsage.turns >= currentUsage.limit.monthlyTurns || currentUsage.estimatedCostUsd >= currentUsage.limit.monthlyCostUsd) {
      const turn = await saveTurn(auth.user.id, {
        page_context: page,
        question,
        answer: "You have reached this month's Ask LVE360 allowance. Your dashboard and saved records remain available, and your coaching allowance resets at the start of next month.",
        response_source: "budget",
        generation_status: "limited",
        source_refs: [],
      });
      return NextResponse.json({ ok: true, turn, usage: await usage(auth.user.id) });
    }

    const context = await buildCoachContext(auth.user.id, page);
    const { data: pending, error: pendingError } = await getSupabaseAdmin().from("ai_coaching_turns").insert({
      user_id: auth.user.id,
      page_context: page,
      question,
      answer: "",
      response_source: "fallback",
      generation_status: "pending",
      prompt_version: COACH_PROMPT_VERSION,
      source_refs: context.sources,
    }).select("id").single();
    if (pendingError) throw pendingError;

    let answer = "I could not create a grounded answer right now. Review the linked LVE360 records, then try again. Your saved information has not been changed.";
    let sourceRefs: CoachSource[] = context.sources;
    let responseSource: CoachTurn["response_source"] = "fallback";
    let generationStatus: CoachTurn["generation_status"] = "failed";
    try {
      const generated = await generateCoachAnswer(auth.user.id, question, context);
      if (generated) {
        answer = generated.answer;
        sourceRefs = context.sources.filter((source) => generated.sourceIds.includes(source.id));
        responseSource = generated.responseSource;
        generationStatus = "succeeded";
      }
    } catch (error) {
      console.warn("[coach] generation unavailable; returning grounded fallback", error);
    }

    const { data: turn, error: updateError } = await getSupabaseAdmin().from("ai_coaching_turns").update({
      answer,
      source_refs: sourceRefs,
      response_source: responseSource,
      generation_status: generationStatus,
      updated_at: new Date().toISOString(),
    }).eq("id", pending.id).eq("user_id", auth.user.id)
      .select("id,page_context,question,answer,response_source,generation_status,source_refs,feedback,created_at").single();
    if (updateError) throw updateError;
    return NextResponse.json({ ok: true, turn: turn as CoachTurn, usage: await usage(auth.user.id) });
  } catch (error) {
    console.error("[coach] answer failed", error);
    return NextResponse.json({ ok: false, error: "coach_unavailable" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const auth = await requirePaidUser();
    if (auth.error || !auth.user) return authResponse(auth.error ?? "unauthorized");
    const body = await req.json().catch(() => null);
    if (typeof body?.id !== "string" || !isCoachFeedback(body?.feedback)) {
      return NextResponse.json({ ok: false, error: "invalid_feedback" }, { status: 400 });
    }
    const { data, error } = await getSupabaseAdmin().from("ai_coaching_turns")
      .update({ feedback: body.feedback, updated_at: new Date().toISOString() })
      .eq("id", body.id).eq("user_id", auth.user.id)
      .select("id,feedback").maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ ok: false, error: "turn_not_found" }, { status: 404 });
    return NextResponse.json({ ok: true, turn: data });
  } catch (error) {
    console.error("[coach] feedback failed", error);
    return NextResponse.json({ ok: false, error: "coach_unavailable" }, { status: 500 });
  }
}
