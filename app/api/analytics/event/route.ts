import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { recordProductEvent } from "@/lib/productAnalytics";
import { validateProductEvent } from "@/lib/productAnalyticsTypes";

const VISITOR_COOKIE = "lve_visitor_id";
const CLIENT_EVENTS = new Set([
  "homepage_viewed",
  "pricing_viewed",
  "intake_started",
  "blueprint_viewed",
  "blueprint_action_selected",
  "checkout_started",
]);

export async function POST(req: NextRequest) {
  try {
    const event = validateProductEvent(await req.json().catch(() => null));
    if (!event) return NextResponse.json({ ok: false, error: "invalid_event" }, { status: 400 });
    if (!CLIENT_EVENTS.has(event.event_name)) {
      return NextResponse.json({ ok: false, error: "server_event_required" }, { status: 403 });
    }

    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    const existingVisitor = req.cookies.get(VISITOR_COOKIE)?.value;
    const visitorIsValid = isUuid(existingVisitor);
    const visitorId = visitorIsValid ? existingVisitor : crypto.randomUUID();

    await recordProductEvent({ ...event, visitor_id: visitorId, user_id: user?.id ?? null });

    const response = NextResponse.json({ ok: true });
    if (!visitorIsValid) {
      response.cookies.set(VISITOR_COOKIE, visitorId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
      });
    }
    return response;
  } catch (error) {
    console.error("[analytics/event] failed", error);
    return NextResponse.json({ ok: false, error: "event_unavailable" }, { status: 500 });
  }
}

function isUuid(value: string | undefined): value is string {
  return !!value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
