// -----------------------------------------------------------------------------
// app/api/provision-user/route.ts
// Ensures every signed-in user has a matching public.users record (same UUID),
// migrates any legacy row with a different id, and attaches pre-login submissions.
// -----------------------------------------------------------------------------
import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST() {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const email = user.email?.toLowerCase() ?? null;

  if (!email || !user.email_confirmed_at) {
    return NextResponse.json({ ok: false, error: "verified_email_required" }, { status: 409 });
  }

  // Single atomic repair + attach step in the DB.
  const { error: reconciliationError } = await supabaseAdmin.rpc("reconcile_user_and_attach_v2", {
    p_email: email,
    p_new_id: user.id,
  });
  if (reconciliationError) {
    console.error("[provision-user] reconciliation failed", reconciliationError.message);
    return NextResponse.json({ ok: false, error: "blueprint_connection_failed" }, { status: 500 });
  }


  // Optionally return the user's tier so client can decide immediately
  const { data: profile } = await supabaseAdmin
    .from("users")
    .select("tier")
    .eq("id", user.id)
    .maybeSingle();

  return NextResponse.json({ ok: true, tier: profile?.tier ?? "free", reconciled: true });
}
