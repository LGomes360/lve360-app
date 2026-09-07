// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs";
import { resolveProductMode } from "@/lib/productModeConfig";

export async function middleware(req: NextRequest) {
  const productMode = resolveProductMode(process.env);
  const pathname = req.nextUrl.pathname;

  if (
    productMode.accessMode === "invite_only"
    && ((pathname === "/pricing" && !productMode.publicPricingEnabled)
      || (pathname === "/upgrade" && !productMode.billingCheckoutEnabled))
  ) {
    return NextResponse.redirect(new URL("/request-invitation", req.url));
  }

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
    "/pricing",
    "/auth/:path*",
    "/dashboard/:path*",
    "/account/:path*",
    "/results/:path*",
    "/upgrade",
    "/api/:path*",
  ],
};
