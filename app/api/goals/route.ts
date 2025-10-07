// app/api/goals/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

type Body = {
  userId: string;
  goals?: string[];       // e.g. ["Weight Loss","Longevity"]
  custom_goal?: string;   // free text
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const userId = url.searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("goals")
    .select("goals, custom_goal, target_weight, target_sleep, target_energy")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ goals: data?.goals ?? [], custom_goal: data?.custom_goal ?? null });
}

export async function POST(req: Request) {
  const body = (await req.json()) as Body;
  if (!body?.userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  const payload = {
    user_id: body.userId,
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
