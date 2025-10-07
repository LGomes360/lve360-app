// app/api/stripe/webhook/route.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabase";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "", {
  apiVersion: "2023-10-16",
});

export async function POST(req: NextRequest) {
  try {
    const sig = req.headers.get("stripe-signature") ?? "";
    const raw = Buffer.from(await req.arrayBuffer());

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(
        raw,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET ?? ""
      );
    } catch (err: any) {
      console.error("❌ Webhook signature verification failed:", err.message);
      return NextResponse.json(
        { error: "Invalid Stripe signature", details: String(err?.message ?? err) },
        { status: 400 }
      );
    }

    console.log("✅ Webhook event:", event.type, "ID:", event.id);

    // ───────────────────────────────────────────────
    // 0️⃣ Deduplicate events
    // ───────────────────────────────────────────────
    const eventId = event.id;
    const { data: existing } = await supabaseAdmin
      .from("stripe_events")
      .select("id")
      .eq("id", eventId)
      .maybeSingle();
    if (existing) {
      console.log("ℹ️ Duplicate webhook ignored:", eventId);
      return NextResponse.json({ received: true, deduped: true });
    }

    await supabaseAdmin
      .from("stripe_events")
      .insert([{ id: eventId, raw: event, created_at: new Date().toISOString() }]);

    // ───────────────────────────────────────────────
    // 1️⃣ Checkout completed → upgrade user + record subscription
    // ───────────────────────────────────────────────
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const email =
        session.customer_details?.email ?? session.metadata?.email ?? null;
      const stripeCustomerId = (session.customer as string) ?? null;

      if (email) {
        // Ensure Supabase Auth user exists
        try {
          const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 100 });
          if (!list?.users?.find((u: any) => u.email === email)) {
            await supabaseAdmin.auth.admin.createUser({ email, email_confirm: true });
          }
        } catch (e) {
          console.warn("⚠️ Auth user check failed:", (e as any)?.message);
        }

        const chosenTier =
          session.metadata?.plan === "concierge" ? "concierge" : "premium";
        const billingInterval =
          session.metadata?.plan === "annual" ? "annual" : "monthly";

        await supabaseAdmin.from("users").upsert(
          {
            email,
            tier: chosenTier,
            billing_interval: billingInterval,
            stripe_customer_id: stripeCustomerId,
            stripe_subscription_status: "active",
            subscription_end_date: null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "email" }
        );

        console.log(`📝 Upserted user ${email} → ${chosenTier} (${billingInterval})`);
      }

      if (session.subscription) {
        const subscriptionId = session.subscription as string;
        const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 1 });
        const priceId = lineItems.data[0]?.price?.id ?? session.metadata?.price_id ?? null;
        await supabaseAdmin.from("subscriptions").upsert({
          id: subscriptionId,
          customer: stripeCustomerId,
          price: priceId,
          status: "active",
          raw: session,
        });
      }
    }

    // ───────────────────────────────────────────────
    // 2️⃣ Subscription updates → handle lifecycle + cancellations
    // ───────────────────────────────────────────────
    if (event.type.startsWith("customer.subscription.")) {
      const sub = event.data.object as Stripe.Subscription;
      console.log("🔄 Subscription update:", sub.id, "|", sub.status);

      // Always sync subscription table
      await supabaseAdmin.from("subscriptions").upsert({
        id: sub.id,
        customer: sub.customer,
        status: sub.status,
        raw: sub,
      });

      const customer = await stripe.customers.retrieve(sub.customer as string);
      const email = (customer as Stripe.Customer).email;
      if (!email) return NextResponse.json({ received: true });

      // Determine billing interval from plan
      const planInterval = sub.items?.data?.[0]?.plan?.interval; // 'month' | 'year'
      const billingInterval =
        planInterval === "year" ? "annual" : planInterval === "month" ? "monthly" : null;

      // Extract Stripe timestamps
      const cancelAt = sub.cancel_at ? new Date(sub.cancel_at * 1000).toISOString() : null;
      const currentPeriodEnd = sub.current_period_end
        ? new Date(sub.current_period_end * 1000).toISOString()
        : null;
      const canceledAt = sub.canceled_at ? new Date(sub.canceled_at * 1000).toISOString() : null;
      const endedAt = sub.ended_at ? new Date(sub.ended_at * 1000).toISOString() : null;

      const endDate =
        cancelAt ??
        currentPeriodEnd ??
        endedAt ??
        canceledAt ??
        (sub.status === "canceled" ? new Date().toISOString() : null);

      // Case A: Scheduled cancel → stay premium
      if (sub.cancel_at_period_end && endDate) {
        console.log(`⏳ ${email} scheduled to cancel on ${endDate}`);
        await supabaseAdmin
          .from("users")
          .update({
            stripe_subscription_status: sub.status,
            billing_interval: billingInterval,
            subscription_end_date: endDate,
            updated_at: new Date().toISOString(),
          })
          .eq("email", email);
      }
      // Case B: Immediate cancel / unpaid
      else if (["canceled", "unpaid", "incomplete_expired"].includes(sub.status)) {
        console.log(`💀 ${email} canceled → free`);
        await supabaseAdmin.from("users").upsert(
          {
            email,
            tier: "free",
            stripe_customer_id: sub.customer as string,
            stripe_subscription_status: sub.status,
            billing_interval: billingInterval,
            subscription_end_date: endDate,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "email" }
        );
      }
      // Case C: Active / resumed
      else {
        console.log(`🧭 ${email} active/resumed`);
        await supabaseAdmin.from("users").upsert(
          {
            email,
            tier: "premium",
            stripe_customer_id: sub.customer as string,
            stripe_subscription_status: sub.status,
            billing_interval: billingInterval,
            subscription_end_date: null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "email" }
        );
      }
    }

    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error("❌ Webhook error:", err);
    return NextResponse.json({ error: String(err?.message ?? err) }, { status: 500 });
  }
}
