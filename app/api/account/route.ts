import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET() {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json(null);

  const { data } = await supabase
    .from("users")
    .select("email, tier, billing_interval, subscription_end_date")
    .eq("email", user.email)
    .maybeSingle();

  return NextResponse.json(data);
}
