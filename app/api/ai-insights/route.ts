import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json(); // { log_id?, weight?, sleep?, energy?, notes? }
  const summary = "Sleep dipped while energy held. Try magnesium earlier and 10-min wind-down.";

  const { error } = await supabase.from("ai_summaries").insert({
    user_id: user.id,
    log_id: body.log_id ?? null,
    summary
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ summary });
}
