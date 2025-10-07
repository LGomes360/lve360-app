// -----------------------------------------------------------------------------
// File: app/api/logs/route.ts
// Fix: ensure log inserts use public.users.id (not auth.users.id)
// -----------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET() {
  const supabase = createRouteHandlerClient({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // look up user's public.users record by email
  const { data: publicUser } = await supabaseAdmin
    .from("users")
    .select("id")
    .eq("email", user.email)
    .maybeSingle();

  if (!publicUser?.id)
    return NextResponse.json({ error: "No matching public user record" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("logs")
    .select("*")
    .eq("user_id", publicUser.id)
    .order("log_date", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // get the corresponding public.users.id
  const { data: publicUser, error: lookupErr } = await supabaseAdmin
    .from("users")
    .select("id")
    .eq("email", user.email)
    .maybeSingle();

  if (lookupErr)
    return NextResponse.json({ error: lookupErr.message }, { status: 500 });

  if (!publicUser?.id)
    return NextResponse.json({ error: "No matching public user found" }, { status: 400 });

  const body = await req.json();
  const payload = { ...body, user_id: publicUser.id };

  const { error } = await supabase
    .from("logs")
    .upsert(payload, { onConflict: "user_id,log_date", ignoreDuplicates: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
