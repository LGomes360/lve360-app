// app/auth/callback/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });

  // Parse search params
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    // Exchange code for session and set cookie
    await supabase.auth.exchangeCodeForSession(code);
  }

  // Redirect user to next page (e.g., /dashboard)
  return NextResponse.redirect(new URL(next, req.url));
}
