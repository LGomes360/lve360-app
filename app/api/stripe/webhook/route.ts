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

// ------------------- CONFIG -------------------
const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY!;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET!;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.lve360.com";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {apiVersion: "2024-06-20",});

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
        const customerId = session.customer as string;
        const email =
          (session.customer_details?.email ||
            session.client_reference_id ||
            "").toLowerCase();

        if (!email) {
          console.warn("⚠️ Stripe checkout missing email:", session.id);
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

        await supa.from("users").upsert(
          {
            email,
            stripe_customer_id: customerId,
            tier: "premium",
            billing_interval: interval,
            subscription_end_date: endDate
              ? endDate.toISOString()
              : null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "email" }
        );

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
        const price = sub.items.data[0]?.price;
        const unit = price?.recurring?.interval;
        const interval: "monthly" | "annual" =
          unit === "year" ? "annual" : "monthly";
        const endDate = sub.current_period_end
          ? new Date(sub.current_period_end * 1000)
          : null;

        const customer = await stripe.customers.retrieve(customerId);
        const email = (customer as Stripe.Customer).email?.toLowerCase();

        if (!email) {
          console.warn("⚠️ Subscription update missing email:", sub.id);
          return NextResponse.json({ received: true }, { status: 200 });
        }

        await supa.from("users").upsert(
          {
            email,
            stripe_customer_id: customerId,
            tier: sub.status === "active" ? "premium" : "free",
            billing_interval: interval,
            subscription_end_date: endDate
              ? endDate.toISOString()
              : null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "email" }
        );

        console.log(`🔄 Synced subscription for ${email}`);
        return NextResponse.json({ received: true }, { status: 200 });
      }

      // --------------------------------------------------
      // Subscription deleted → downgrade to free
      // --------------------------------------------------
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = sub.customer as string;

        const customer = await stripe.customers.retrieve(customerId);
        const email = (customer as Stripe.Customer).email?.toLowerCase();

        if (!email) {
          console.warn("⚠️ Subscription deletion missing email:", sub.id);
          return NextResponse.json({ received: true }, { status: 200 });
        }

        await supa.from("users").upsert(
          {
            email,
            stripe_customer_id: customerId,
            tier: "free",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "email" }
        );

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
