import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { bucketsForItem, collapseBucketsToString } from "@/src/lib/timing";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

    const { id, timing, ...rest } = await req.json();
    if (!id) return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });

    const patch: any = { ...rest };

    if (typeof timing !== "undefined") {
      const bucketArr = bucketsForItem(timing);
      patch.timing = timing;
      patch.timing_bucket = collapseBucketsToString(bucketArr);
    }

    const { error } = await supabase
      .from("stacks_items")
      .update(patch)
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "unknown_error" }, { status: 500 });
  }
}
