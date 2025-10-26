// app/api/stripe/confirm/route.ts
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = false;

import { NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabase"; // your admin client

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2024-06-20" });

function mapInterval(raw?: string | null): "monthly" | "annual" | null {
  return raw === "month" ? "monthly" : raw === "year" ? "annual" : null;
}

async function findUserIdByEmail(email: string | null | undefined) {
  if (!email) return null;
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id")
    .eq("email", email.toLowerCase())
    .maybeSingle();
  if (error) {
    console.error("[stripe/confirm] lookup by email error:", error);
    return null;
  }
  return data?.id ?? null;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const sessionId = url.searchParams.get("session_id");
    if (!sessionId) {
      console.warn("[stripe/confirm] no session_id");
      return NextResponse.json({ ok: false, error: "no-session-id" }, { status: 400 });
    }

    // Pull full session with subscription + customer details
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["subscription", "customer"],
    });

    const sub = session.subscription as Stripe.Subscription | null;
    const custId = typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;
    const customerEmail =
      session.customer_details?.email ??
      (typeof session.customer !== "string" ? session.customer?.email : null) ??
      null;

    // Resolve target user id without relying on cookies
    let targetUserId =
      session.client_reference_id ||
      (session.metadata && (session.metadata as any).user_id) ||
      null;

    if (!targetUserId) {
      // last-resort: try to find by email
      targetUserId = await findUserIdByEmail(customerEmail);
    }

    console.log("[stripe/confirm] session summary:", {
      session_id: session.id,
      payment_status: session.payment_status,
      client_reference_id: session.client_reference_id || null,
      metadata_user_id: (session.metadata as any)?.user_id ?? null,
      customer: custId,
      customer_email: customerEmail,
      resolved_user_id: targetUserId,
      sub_status: sub?.status ?? null,
      sub_interval: sub?.items?.data?.[0]?.plan?.interval ?? null,
      current_period_end: sub?.current_period_end ?? null,
    });

    if (!targetUserId) {
      console.error("[stripe/confirm] could not resolve target user id");
      return NextResponse.json({ ok: false, error: "no-target-user" }, { status: 422 });
    }

    // Compute mapped fields
    const rawStatus = sub?.status ?? session.payment_status; // "active"|"trialing"|"paid"|...
    const mappedInterval = mapInterval(sub?.items?.data?.[0]?.plan?.interval ?? null);
    const endIso = sub?.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null;
    const isPremium = rawStatus === "active" || rawStatus === "trialing" || session.payment_status === "paid";

    // Upsert user row by id (create if missing, then update premium fields)
    // 1) Ensure row exists
    const ensure = await supabaseAdmin
      .from("users")
      .upsert(
        {
          id: targetUserId,
          email: (customerEmail ?? "").toLowerCase(),
          tier: isPremium ? "premium" : "free",
          stripe_customer_id: custId,
          stripe_subscription_status: rawStatus ?? null,
          billing_interval: mappedInterval,
          subscription_end_date: endIso,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" }
      )
      .select("id, tier")
      .maybeSingle();

    if (ensure.error) {
      console.error("[stripe/confirm] upsert error:", ensure.error);
      return NextResponse.json({ ok: false, error: "db-upsert-failed" }, { status: 500 });
    }

    // 2) If row existed and email is empty there, patch email if we have it
    if (customerEmail) {
      await supabaseAdmin
        .from("users")
        .update({ email: customerEmail.toLowerCase() })
        .eq("id", targetUserId)
        .is("email", null);
    }

    console.log("[stripe/confirm] user updated:", {
      id: targetUserId,
      tier: isPremium ? "premium" : "free",
      stripe_customer_id: custId,
      stripe_subscription_status: rawStatus ?? null,
      billing_interval: mappedInterval,
      subscription_end_date: endIso,
    });

    return NextResponse.json({
      ok: true,
      user_id: targetUserId,
      premium: isPremium,
      status: rawStatus,
      interval: mappedInterval,
      customer: custId,
    });
  } catch (err: any) {
    console.error("[stripe/confirm] unhandled error:", err);
    return NextResponse.json({ ok: false, error: err?.message ?? "confirm_failed" }, { status: 500 });
  }
}
