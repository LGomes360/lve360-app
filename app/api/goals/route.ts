// app/api/goals/route.ts
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { requirePaidApi } from "@/lib/serverEntitlements";

export const dynamic = "force-dynamic";

type Body = {
  userId?: string;
  goals?: string[];       // e.g. ["Weight Loss","Longevity"]
  custom_goal?: string;   // free text
};

export async function GET(req: Request) {
  const entitlement = await requirePaidApi();
  if (!entitlement.ok) return entitlement.response;

  const url = new URL(req.url);
  const requestedUserId = url.searchParams.get("userId");
  if (requestedUserId && requestedUserId !== entitlement.user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const userId = entitlement.user.id;

  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from("goals")
    .select("goals, custom_goal, target_weight, target_sleep, target_energy")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ goals: data?.goals ?? [], custom_goal: data?.custom_goal ?? null });
}

export async function POST(req: Request) {
  const entitlement = await requirePaidApi();
  if (!entitlement.ok) return entitlement.response;

  const body = (await req.json()) as Body;
  if (body?.userId && body.userId !== entitlement.user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const supabaseAdmin = getSupabaseAdmin();
  const payload = {
    user_id: entitlement.user.id,
    goals: body.goals ?? [],
    custom_goal: body.custom_goal ?? null,
  };

  const { data, error } = await supabaseAdmin
    .from("goals")
    .upsert(payload, { onConflict: "user_id" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, goals: data });
}
