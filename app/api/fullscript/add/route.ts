// app/api/fullscript/add/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(req: Request) {
  const cookieStore = cookies();
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore });

  try {
    const { data: userWrap, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userWrap?.user?.id) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
    const userId = userWrap.user.id;

    const body = await req.json();
    const {
      name,
      brand = null,
      dose = null,
      link_fullscript = null,
      link_amazon = null,
      source = "fullscript",
      sku = null,
      timing = "AM",
      notes = null,
    } = body || {};

    if (!name) {
      return NextResponse.json({ ok: false, error: "name_required" }, { status: 400 });
    }

    // admin client to upsert (safer for creating stack if none exists)
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false }});

    // 1) ensure latest stack for user
    const { data: stacksRows, error: stacksErr } = await admin
      .from("stacks")
      .select("id, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1);

    if (stacksErr) throw stacksErr;

    let stackId = stacksRows?.[0]?.id;
    if (!stackId) {
      const { data: newStack, error: insErr } = await admin
        .from("stacks")
        .insert({
          user_id: userId,
          user_email: userWrap.user.email ?? "unknown@lve360.com",
          submission_id: crypto.randomUUID(), // placeholder if you require this non-null
          version: "manual-add",
          items: [],
          summary: null,
          total_monthly_cost: 0,
          notes: "Created by /api/fullscript/add",
        })
        .select("id")
        .single();
      if (insErr) throw insErr;
      stackId = newStack.id;
    }

    // 2) insert stacks_items row
    const { error: itemErr } = await admin.from("stacks_items").insert({
      stack_id: stackId,
      user_id: userId,
      user_email: userWrap.user.email ?? null,
      name,
      brand,
      dose,
      timing,
      notes,
      link_fullscript,
      link_amazon,
      link_other: null,
      link_type: link_fullscript ? "fullscript" : link_amazon ? "amazon" : null,
      source,
      sku,
      is_custom: source === "custom",
    });

    if (itemErr) throw itemErr;

    return NextResponse.json({ ok: true, stack_id: stackId });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "add_failed" }, { status: 500 });
  }
}
