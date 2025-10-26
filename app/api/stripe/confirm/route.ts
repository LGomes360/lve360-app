import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { supabaseAdmin } from "@/lib/supabase"; // ✅ your style
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2024-06-20" });

export async function GET(req: Request) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "no-user" }, { status: 401 });

  const url = new URL(req.url);
  const sessionId = url.searchParams.get("session_id");
  if (!sessionId) return NextResponse.json({ ok: false, error: "no-session-id" }, { status: 400 });

  const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ["subscription", "customer"] });
  const sub = session.subscription as Stripe.Subscription | null;
  const custId = typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;
  const status = sub?.status ?? session.payment_status;             // "active"|"trialing"|"paid"|...
  const interval = sub?.items?.data?.[0]?.plan?.interval ?? null;   // "month"|"year"|null
  const endIso = sub?.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null;

  const isPremium = status === "active" || status === "trialing" || session.payment_status === "paid";

  await supabaseAdmin
    .from("users")
    .update({
      stripe_customer_id: custId,
      stripe_subscription_status: status ?? null,
      billing_interval: interval,
      subscription_end_date: endIso,
      tier: isPremium ? "premium" : "free",
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  return NextResponse.json({ ok: true, premium: isPremium });
}
