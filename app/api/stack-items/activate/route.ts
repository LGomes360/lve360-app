import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { item_id?: string } | null;
  if (!body?.item_id) return NextResponse.json({ ok: false, error: "item_id_required" }, { status: 400 });
  const { data, error } = await supabase.from("stacks_items").update({ is_current: true })
    .eq("id", body.item_id).eq("user_id", user.id).select("id").maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ ok: false, error: "item_not_found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
