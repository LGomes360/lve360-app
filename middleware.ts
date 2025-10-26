// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs";

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createMiddlewareClient({ req, res });

  // Refresh session cookies on each request (no gating here)
  try {
    await supabase.auth.getSession();
  } catch {
    // ignore
  }

  return res;
}

// Run on key routes; adjust if needed
export const config = {
  matcher: [
    "/",
    "/login",
    "/auth/:path*",
    "/dashboard/:path*",
    "/account/:path*",
    "/results/:path*",
    "/upgrade",
    "/api/:path*",
  ],
};
