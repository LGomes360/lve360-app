import { NextResponse } from "next/server";

import { isFounderUser } from "@/lib/productMode";
import { supabaseRoute } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const formData = await request.formData();
  const authorizationId = formData.get("authorization_id");
  const decision = formData.get("decision");
  if (
    typeof authorizationId !== "string"
    || authorizationId.length < 1
    || authorizationId.length > 500
    || (decision !== "approve" && decision !== "deny")
  ) {
    return NextResponse.json({ error: "invalid_authorization_decision" }, { status: 400 });
  }

  const supabase = supabaseRoute();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));
  if (!isFounderUser(user.id)) {
    return NextResponse.json({ error: "founder_pilot_only" }, { status: 403 });
  }

  const result = decision === "approve"
    ? await supabase.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true })
    : await supabase.auth.oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true });

  if (result.error || !result.data?.redirect_url) {
    return NextResponse.json({ error: "authorization_decision_failed" }, { status: 400 });
  }
  return NextResponse.redirect(result.data.redirect_url, 303);
}
