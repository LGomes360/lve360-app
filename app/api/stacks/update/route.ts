import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { requirePaidApi } from "@/lib/serverEntitlements";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: Request) {
  try {
    const entitlement = await requirePaidApi();
    if (!entitlement.ok) return entitlement.response;

    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

    const { id, purpose, dose, timing, active } = await req.json();
    if (!id) return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });

    const patch: Record<string, unknown> = Object.fromEntries(
      Object.entries({ purpose, dose, timing, active })
        .filter(([, value]) => typeof value !== "undefined")
    );
    if (!Object.keys(patch).length) {
      return NextResponse.json({ ok: false, error: "no_supported_changes" }, { status: 400 });
    }
    patch.instruction_source = "member_update";
    patch.updated_at = new Date().toISOString();

    const { data, error } = await getSupabaseAdmin()
      .from("current_regimen_items")
      .update(patch)
      .eq("id", id)
      .eq("user_id", user.id)
      .select("id")
      .maybeSingle();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    if (!data) return NextResponse.json({ ok: false, error: "regimen_item_not_found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "unknown_error" }, { status: 500 });
  }
}
