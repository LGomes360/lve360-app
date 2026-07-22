// -----------------------------------------------------------------------------
// File: app/api/stripe/webhook/route.ts
// LVE360 // Stripe Webhook Handler (2025-10-13 Hardened A.3)
// Purpose:
//   • Verify Stripe signatures (raw body).
//   • Upsert users with correct tier, interval, and subscription end date.
//   • Log all failures in Supabase (webhook_failures table).
// -----------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin as supa } from "@/lib/supabaseAdmin";
import { recordProductEventSafely } from "@/lib/productAnalytics";

// ------------------- CONFIG -------------------
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET!;

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {apiVersion: "2024-06-20",});

async function syncUserProfile(
  userId: string | null,
  email: string | null,
  fields: Record<string, unknown>
) {
  const payload = {
    ...fields,
    ...(email ? { email } : {}),
    updated_at: new Date().toISOString(),
  };

  if (userId) {
    const updated = await supa
      .from("users")
      .update(payload)
      .eq("id", userId)
      .select("id")
      .maybeSingle();
    if (updated.error) throw updated.error;
    if (updated.data) return;

    const inserted = await supa
      .from("users")
      .upsert({ id: userId, ...payload }, { onConflict: "id" });
    if (inserted.error) throw inserted.error;
    return;
  }

  if (!email) throw new Error("Stripe event could not be matched to a user");
  const fallback = await supa.from("users").upsert(payload, { onConflict: "email" });
  if (fallback.error) throw fallback.error;
}

async function resolveProductUserId(userId: string | null, email: string | null): Promise<string | null> {
  if (userId) return userId;
  if (!email) return null;
  const { data } = await supa.from("users").select("id").eq("email", email).maybeSingle();
  return data?.id ?? null;
}

// ------------------- MAIN HANDLER -------------------
export async function POST(req: NextRequest) {
  const sig = req.headers.get("stripe-signature") || "";
  const rawBody = await req.text();

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, STRIPE_WEBHOOK_SECRET);
  } catch (err: any) {
    console.error("⚠️ Stripe signature verification failed:", err.message);
    await supa.from("webhook_failures").insert({
      source: "stripe",
      event_type: "signature_error",
      error_message: err.message ?? "signature_verification_failed",
      severity: "critical",
      payload_json: { sig },
    });
    return NextResponse.json({ received: true }, { status: 400 });
  }

  try {
    const type = event.type;
    console.log("✅ Stripe event received:", type);

    // Handle core event types only
    switch (type) {
      // --------------------------------------------------
      // Checkout completed → set tier to premium
      // --------------------------------------------------
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const customerId = typeof session.customer === "string" ? session.customer : null;
        const userId = session.client_reference_id || session.metadata?.user_id || null;
        const email = session.customer_details?.email?.toLowerCase() || null;

        if (!userId && !email) {
          console.warn("⚠️ Stripe checkout missing user correlation:", session.id);
          return NextResponse.json({ received: true }, { status: 200 });
        }

        let interval: "monthly" | "annual" = "monthly";
        let endDate: Date | null = null;

        if (session.subscription) {
          const sub = await stripe.subscriptions.retrieve(
            typeof session.subscription === "string"
              ? session.subscription
              : session.subscription.id
          );
          const price = sub.items.data[0]?.price;
          const unit = price?.recurring?.interval;
          if (unit === "year") interval = "annual";
          endDate = sub.current_period_end
            ? new Date(sub.current_period_end * 1000)
            : null;
        }

        await syncUserProfile(userId, email, {
          stripe_customer_id: customerId,
          tier: "premium",
          billing_interval: interval,
          subscription_end_date: endDate ? endDate.toISOString() : null,
        });

        const productUserId = await resolveProductUserId(userId, email);
        if (productUserId) {
          await recordProductEventSafely({
            event_name: "checkout_completed",
            source: "stripe",
            user_id: productUserId,
            plan: interval,
            event_key: `stripe:${event.id}:checkout`,
          });
        }

        console.log(`💎 Upgraded ${email} → premium (${interval})`);
        return NextResponse.json({ received: true }, { status: 200 });
      }

      // --------------------------------------------------
      // Subscription created/updated → sync interval + tier
      // --------------------------------------------------
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = sub.customer as string;
        const userId = sub.metadata?.user_id || null;
        const price = sub.items.data[0]?.price;
        const unit = price?.recurring?.interval;
        const interval: "monthly" | "annual" =
          unit === "year" ? "annual" : "monthly";
        const endDate = sub.current_period_end
          ? new Date(sub.current_period_end * 1000)
          : null;

        const customer = await stripe.customers.retrieve(customerId);
        const email = (customer as Stripe.Customer).email?.toLowerCase() || null;

        if (!userId && !email) {
          console.warn("⚠️ Subscription update missing user correlation:", sub.id);
          return NextResponse.json({ received: true }, { status: 200 });
        }

        await syncUserProfile(userId, email, {
          stripe_customer_id: customerId,
          tier:
            sub.status === "active" || sub.status === "trialing"
              ? "premium"
              : "free",
          billing_interval: interval,
          subscription_end_date: endDate ? endDate.toISOString() : null,
        });

        if (sub.cancel_at_period_end) {
          const productUserId = await resolveProductUserId(userId, email);
          if (productUserId) {
            await recordProductEventSafely({
              event_name: "subscription_cancelled",
              source: "stripe",
              user_id: productUserId,
              event_key: `stripe:subscription:${sub.id}:cancelled`,
            });
          }
        }

        console.log(`🔄 Synced subscription for ${email}`);
        return NextResponse.json({ received: true }, { status: 200 });
      }

      // --------------------------------------------------
      // Subscription deleted → downgrade to free
      // --------------------------------------------------
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = sub.customer as string;
        const userId = sub.metadata?.user_id || null;

        const customer = await stripe.customers.retrieve(customerId);
        const email = (customer as Stripe.Customer).email?.toLowerCase() || null;

        if (!userId && !email) {
          console.warn("⚠️ Subscription deletion missing user correlation:", sub.id);
          return NextResponse.json({ received: true }, { status: 200 });
        }

        await syncUserProfile(userId, email, {
          stripe_customer_id: customerId,
          tier: "free",
        });

        const productUserId = await resolveProductUserId(userId, email);
        if (productUserId) {
          await recordProductEventSafely({
            event_name: "subscription_cancelled",
            source: "stripe",
            user_id: productUserId,
            event_key: `stripe:subscription:${sub.id}:cancelled`,
          });
        }

        console.log(`⬇️ Downgraded ${email} → free`);
        return NextResponse.json({ received: true }, { status: 200 });
      }

      // --------------------------------------------------
      // Default: ignore unsupported event types
      // --------------------------------------------------
      default:
        console.log("ℹ️ Ignored Stripe event type:", type);
        return NextResponse.json({ received: true }, { status: 200 });
    }
  } catch (e: any) {
    console.error("❌ Stripe webhook handling failed:", e?.message || e);

    await supa.from("webhook_failures").insert({
      source: "stripe",
      event_type: "handler_error",
      error_message: e.message ?? "unknown_error",
      severity: "critical",
      payload_json: { eventType: e.type ?? "unknown" },
    });

    return NextResponse.json({ received: true }, { status: 500 });
  }
}
