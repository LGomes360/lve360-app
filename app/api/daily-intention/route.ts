import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { generateDailyIntentionSuggestions } from "@/lib/ai/dailyIntentionData";
import {
  DAILY_INTENTION_PROMPT_VERSION,
  normalizeFocusWord,
  parseDailyIntentionSuggestions,
  validateDailyIntention,
  type DailyIntentionRecord,
  type DailyIntentionSource,
} from "@/lib/dailyIntention";
import { isLocalDate } from "@/lib/regimenSchedule";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const COLUMNS = "id,local_date,phrase,focus_word,source,suggestions,suggestion_source";

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

function recordFromRow(row: Record<string, unknown> | null): DailyIntentionRecord | null {
  if (!row) return null;
  const rawSuggestions = Array.isArray(row.suggestions) ? row.suggestions : [];
  return {
    id: String(row.id),
    localDate: String(row.local_date),
    phrase: typeof row.phrase === "string" ? row.phrase : null,
    focusWord: typeof row.focus_word === "string" ? row.focus_word : null,
    source: row.source === "self" || row.source === "ask_lve360" ? row.source : null,
    suggestions: rawSuggestions.length ? parseDailyIntentionSuggestions({ suggestions: rawSuggestions }) : [],
    suggestionSource: row.suggestion_source === "ai" || row.suggestion_source === "fallback" ? row.suggestion_source : null,
  };
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requirePaidUser();
    if (auth.error || !auth.user) return authResponse(auth.error ?? "unauthorized");
    const localDate = req.nextUrl.searchParams.get("date");
    if (!isLocalDate(localDate)) return NextResponse.json({ ok: false, error: "invalid_local_date" }, { status: 400 });
    const { data, error } = await getSupabaseAdmin().from("daily_intentions")
      .select(COLUMNS).eq("user_id", auth.user.id).eq("local_date", localDate).maybeSingle();
    if (error) throw error;
    return NextResponse.json({ ok: true, intention: recordFromRow(data as Record<string, unknown> | null) });
  } catch (error) {
    console.error("[daily-intention] load failed", error);
    return NextResponse.json({ ok: false, error: "daily_intention_unavailable" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requirePaidUser();
    if (auth.error || !auth.user) return authResponse(auth.error ?? "unauthorized");
    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    if (!isLocalDate(body?.date)) return NextResponse.json({ ok: false, error: "invalid_local_date" }, { status: 400 });
    const reflection = typeof body?.reflection === "string" ? body.reflection.slice(0, 240) : "";
    const result = await generateDailyIntentionSuggestions(auth.user.id, body.date, reflection);
    const now = new Date().toISOString();
    const { data, error } = await getSupabaseAdmin().from("daily_intentions").upsert({
      user_id: auth.user.id,
      local_date: body.date,
      suggestions: result.suggestions.map((item) => ({
        focus_word: item.focusWord,
        phrase: item.phrase,
        grounding_key: item.groundingKey,
        why_this_fits: item.whyThisFits,
      })),
      suggestion_source: result.source,
      suggestion_context_hash: result.contextHash,
      prompt_version: DAILY_INTENTION_PROMPT_VERSION,
      ai_generated_at: now,
      updated_at: now,
    }, { onConflict: "user_id,local_date" }).select(COLUMNS).single();
    if (error) throw error;
    return NextResponse.json({ ok: true, intention: recordFromRow(data as Record<string, unknown>) });
  } catch (error) {
    console.error("[daily-intention] suggestions failed", error);
    return NextResponse.json({ ok: false, error: "daily_intention_suggestions_unavailable" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const auth = await requirePaidUser();
    if (auth.error || !auth.user) return authResponse(auth.error ?? "unauthorized");
    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    if (!isLocalDate(body?.date)) return NextResponse.json({ ok: false, error: "invalid_local_date" }, { status: 400 });
    const validation = validateDailyIntention(body?.phrase);
    if (!validation.ok) {
      return NextResponse.json({ ok: false, error: "invalid_daily_intention", reason: validation.error }, { status: 400 });
    }
    const source: DailyIntentionSource = body?.source === "ask_lve360" ? "ask_lve360" : "self";
    const focusWord = normalizeFocusWord(body?.focusWord);
    const now = new Date().toISOString();
    const admin = getSupabaseAdmin();
    const { data: existing, error: existingError } = await admin.from("daily_intentions")
      .select("id").eq("user_id", auth.user.id).eq("local_date", body.date).maybeSingle();
    if (existingError) throw existingError;
    const selection = {
      phrase: validation.phrase,
      focus_word: focusWord,
      source,
      updated_at: now,
    };
    const result = existing
      ? await admin.from("daily_intentions").update(selection)
        .eq("id", existing.id).eq("user_id", auth.user.id).select(COLUMNS).single()
      : await admin.from("daily_intentions").insert({
        user_id: auth.user.id,
        local_date: body.date,
        suggestions: [],
        ...selection,
      }).select(COLUMNS).single();
    const { data, error } = result;
    if (error) throw error;
    return NextResponse.json({ ok: true, intention: recordFromRow(data as Record<string, unknown>) });
  } catch (error) {
    console.error("[daily-intention] save failed", error);
    return NextResponse.json({ ok: false, error: "daily_intention_save_failed" }, { status: 500 });
  }
}
