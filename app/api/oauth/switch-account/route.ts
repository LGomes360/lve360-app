import { NextResponse } from "next/server";

import { supabaseRoute } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const formData = await request.formData();
  const authorizationId = formData.get("authorization_id");
  if (
    typeof authorizationId !== "string"
    || authorizationId.trim().length < 1
    || authorizationId.trim().length > 500
  ) {
    return NextResponse.json({ error: "invalid_authorization_request" }, { status: 400 });
  }

  const normalizedAuthorizationId = authorizationId.trim();
  const supabase = supabaseRoute();
  const { error } = await supabase.auth.signOut({ scope: "local" });
  if (error) {
    return NextResponse.json({ error: "account_switch_failed" }, { status: 500 });
  }

  const next = `/oauth/consent?authorization_id=${encodeURIComponent(normalizedAuthorizationId)}`;
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", next);
  return NextResponse.redirect(loginUrl, 303);
}
