import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { supabaseAdmin } from "@/lib/supabase";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2024-06-20" });

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const sessionId = url.searchParams.get("session_id");
    if (!sessionId) {
      console.warn("[stripe/confirm] no-session-id (400)");
      return NextResponse.json({ ok: false, error: "no-session-id" }, { status: 400 });
    }

    // Try to read the logged-in user (may be absent after Stripe redirect)
    const supabase = createRouteHandlerClient({ cookies });
    const { data: authWrap } = await supabase.auth.getUser();
    const authedUser = authWrap?.user ?? null;

    if (!authedUser) {
      console.warn("[stripe/confirm] warning: no cookie session; will resolve user from Stripe only");
    } else {
      console.log("[stripe/confirm] user:", { id: authedUser.id, email: authedUser.email });
    }
    console.log("[stripe/confirm] session_id:", sessionId);

    // 1) Verify session with Stripe (server→Stripe)
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["subscription", "customer"],
    });

    const sub = session.subscription as Stripe.Subscription | null;
    const customerId =
      typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;

    const rawStatus = sub?.status ?? session.payment_status; // "active" | "trialing" | "paid" | ...
    const rawInterval = sub?.items?.data?.[0]?.plan?.interval ?? null; // "month" | "year" | null
    const billingInterval: "monthly" | "annual" | null =
      rawInterval === "month" ? "monthly" : rawInterval === "year" ? "annual" : null;
    const endIso = sub?.current_period_end
      ? new Date(sub.current_period_end * 1000).toISOString()
      : null;

    const isPremium =
      rawStatus === "active" || rawStatus === "trialing" || session.payment_status === "paid";

    // 2) Resolve which user to update (cookie-independent)
    const metadataUserId = session.metadata?.user_id ?? null;

    // Priority:
    //   A) metadata.user_id (set at checkout creation time)
    //   B) currently authed user (if present)
    //   C) lookup by stripe_customer_id
    let targetUserId: string | null = null;

    if (metadataUserId) {
      targetUserId = metadataUserId;
    } else if (authedUser?.id) {
      targetUserId = authedUser.id;
    } else if (customerId) {
      const { data: found, error: findErr } = await supabaseAdmin
        .from("users")
        .select("id")
        .eq("stripe_customer_id", customerId)
        .maybeSingle();
      if (findErr) console.error("[stripe/confirm] find by customer error:", findErr);
      targetUserId = found?.id ?? null;
    }

    if (!targetUserId) {
      console.error("[stripe/confirm] could not resolve user", {
        sessionId,
        customerId,
        metadataUserId,
        authedUserId: authedUser?.id ?? null,
      });
      return NextResponse.json({ ok: false, error: "user-not-found" }, { status: 404 });
    }

    console.log("[stripe/confirm] resolving target user:", {
      targetUserId,
      chosen: metadataUserId ? "metadata.user_id" : authedUser?.id ? "cookie-user" : "customer-lookup",
    });

    console.log("[stripe/confirm] stripe session:", {
      id: session.id,
      payment_status: session.payment_status,
      customer: customerId,
      subscription_status: sub?.status ?? null,
      rawInterval,
      mappedInterval: billingInterval,
      current_period_end: sub?.current_period_end ?? null,
      isPremium,
      metadata: session.metadata,
    });

    // 3) Update the user's subscription state
    const { error: updateErr } = await supabaseAdmin
      .from("users")
      .update({
        stripe_customer_id: customerId,
        stripe_subscription_status: rawStatus ?? null,
        billing_interval: billingInterval, // mapped to "monthly" | "annual" | null to satisfy DB check
        subscription_end_date: endIso,
        tier: isPremium ? "premium" : "free",
        updated_at: new Date().toISOString(),
      })
      .eq("id", targetUserId);

    if (updateErr) {
      console.error("[stripe/confirm] supabase update error:", updateErr);
      return NextResponse.json({ ok: false, error: "db-update-failed" }, { status: 500 });
    }

    console.log("[stripe/confirm] updated user row:", {
      id: targetUserId,
      tier: isPremium ? "premium" : "free",
      stripe_customer_id: customerId,
      stripe_subscription_status: rawStatus ?? null,
      billing_interval: billingInterval,
      subscription_end_date: endIso,
    });

    return NextResponse.json(
      {
        ok: true,
        premium: isPremium,
        status: rawStatus,
        interval: billingInterval,
        customer: customerId,
        user_id: targetUserId,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("[stripe/confirm] unhandled error:", err);
    return NextResponse.json({ ok: false, error: err?.message ?? String(err) }, { status: 500 });
  }
}
