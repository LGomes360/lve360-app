// app/api/stacks/combined/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const supabase = createRouteHandlerClient({ cookies });

  // 0) Who's calling?
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  // 1) Current items explicitly marked as current
  const { data: current, error: currErr } = await supabase
    .from("stacks_items")
    .select("id, stack_id, user_id, name, brand, dose, timing, timing_bucket, notes, link_amazon, link_fullscript, refill_days_left, last_refilled_at, supplement_id, created_at")
    .eq("user_id", user.id)
    .eq("is_current", true);

  if (currErr) return NextResponse.json({ ok: false, error: currErr.message }, { status: 400 });

  // 2) Latest blueprint (most recent stack)
  const { data: latestStack } = await supabase
    .from("stacks")
    .select("id, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let blueprint: any[] = [];
  if (latestStack?.id) {
    const { data: bp, error: bpErr } = await supabase
      .from("stacks_items")
      .select("id, stack_id, user_id, name, brand, dose, timing, timing_bucket, notes, link_amazon, link_fullscript, refill_days_left, last_refilled_at, supplement_id, created_at")
      .eq("stack_id", latestStack.id);
    if (bpErr) return NextResponse.json({ ok: false, error: bpErr.message }, { status: 400 });
    blueprint = bp ?? [];
  }

  // 3) Merge + de-dupe (prefer 'current' over 'blueprint' when both exist)
  const combined = [...(current ?? []), ...(blueprint ?? [])];
  const seen = new Set<string>();
  const deduped = combined.filter((it) => {
    const key = `${it.supplement_id ?? ""}::${(it.name ?? "").trim().toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return NextResponse.json({
    ok: true,
    latestStack: latestStack ?? null, // so Dashboard header can still show generated date
    items: deduped,
  });
}
