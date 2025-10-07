// -----------------------------------------------------------------------------
// app/api/provision-user/route.ts
// Ensures every signed-in user has a matching public.users record
// -----------------------------------------------------------------------------
import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST() {
  const supabase = createRouteHandlerClient({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const email = user.email?.toLowerCase();
  if (!email) return NextResponse.json({ error: "No email" }, { status: 400 });

  // ensure record exists or update existing
  const { data: existing } = await supabaseAdmin
    .from("users")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (existing?.id && existing.id !== user.id) {
    // update ID to match auth.users
    await supabaseAdmin.from("users").update({ id: user.id }).eq("email", email);
  } else if (!existing) {
    // insert new record
    await supabaseAdmin.from("users").insert({
      id: user.id,
      email,
      tier: "free",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  return NextResponse.json({ ok: true });
}
