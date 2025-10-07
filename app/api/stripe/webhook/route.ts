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
    const sig = (req.headers.get("stripe-signature") ?? "").toString();
    const buf = await req.arrayBuffer();
    const raw = Buffer.from(buf);

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
        {
          error: "Webhook signature verification failed",
          details: String(err?.message ?? err),
        },
        { status: 400 }
      );
    }

    console.log("✅ Webhook event received:", event.type, "ID:", event.id);

    // Deduplicate events
    const eventId = event.id;
    const { data: existing } = await supabaseAdmin
      .from("stripe_events")
      .select("id")
      .eq("id", eventId)
      .maybeSingle();
    if (existing) {
      console.log("ℹ️ Duplicate webhook event ignored:", eventId);
      return NextResponse.json(
        { received: true, deduped: true },
        { status: 200 }
      );
    }

    await supabaseAdmin.from("stripe_events").insert([
      {
        id: eventId,
        raw: event,
        created_at: new Date().toISOString(),
      },
    ]);
    console.log("📦 Stored webhook event:", eventId);

    // -------------------------------------------------------------------------
    // 1️⃣ Checkout Completed → Upgrade User + Store Subscription
    // -------------------------------------------------------------------------
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      console.log("🎉 Checkout completed:", session.id);

      const email =
        session.customer_details?.email ?? session.metadata?.email ?? null;
      const stripeCustomerId = (session.customer as string) ?? null;

      if (email) {
        // Ensure auth.users record exists
        const { data: list } = await supabaseAdmin.auth.admin.listUsers({
          page: 1,
          perPage: 100,
        });
        let authId =
          list?.users?.find((u: any) => u.email === email)?.id ?? null;

        if (!authId) {
          console.log("👤 No auth user found, creating new user for:", email);
          const { data: created, error: createErr } =
            await supabaseAdmin.auth.admin.createUser({
              email,
              email_confirm: true,
            });
          if (createErr)
            console.error("❌ Error creating auth user:", createErr.message);
          authId = created?.user?.id ?? null;
        }

        // Determine plan + billing interval
        const chosenTier =
          session.metadata?.plan === "concierge" ? "concierge" : "premium";
        const billingInterval =
          session.metadata?.plan === "annual" ? "annual" : "monthly";

        // Upsert into users table
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

        console.log(
          `📝 Upserted user ${email} → tier=${chosenTier}, interval=${billingInterval}`
        );
      }

      // Record subscription
      let priceId: string | null = null;
      if (session.id) {
        const lineItems = await stripe.checkout.sessions.listLineItems(
          session.id,
          { limit: 1 }
        );
        priceId =
          lineItems.data[0]?.price?.id ?? session.metadata?.price_id ?? null;
      }

      if (session.subscription) {
        const subscriptionId = session.subscription as string;
        console.log("📌 Recording subscription:", subscriptionId);
        await supabaseAdmin.from("subscriptions").upsert({
          id: subscriptionId,
          customer: stripeCustomerId,
          price: priceId,
          status: "active",
          raw: session,
        });
      }
    }

    // -------------------------------------------------------------------------
    // 2️⃣ Subscription Updates → Sync Lifecycle, Handle Cancellations Gracefully
    // -------------------------------------------------------------------------
    if (event.type.startsWith("customer.subscription.")) {
      const sub = event.data.object as Stripe.Subscription;
      console.log("🔄 Subscription update:", sub.id, "| Status:", sub.status);

      // Always record raw subscription details
      await supabaseAdmin.from("subscriptions").upsert({
        id: sub.id,
        customer: sub.customer,
        status: sub.status,
        raw: sub,
      });

      // Keep user in sync
      if (sub.customer) {
        const customer = await stripe.customers.retrieve(sub.customer as string);
        const email = (customer as Stripe.Customer).email;

        if (email) {
          const cancelAt = sub.cancel_at
            ? new Date(sub.cancel_at * 1000).toISOString()
            : null;
          const cancelAtPeriodEnd = sub.cancel_at_period_end || false;

          // Determine new tier logic
          let tier = "premium";
          if (["canceled", "unpaid", "incomplete_expired"].includes(sub.status))
            tier = "free";

          if (cancelAtPeriodEnd && cancelAt) {
            // Scheduled cancellation → keep premium until end date
            console.log(
              `⏳ ${email} scheduled to cancel on ${cancelAt} (status: ${sub.status})`
            );
            await supabaseAdmin
              .from("users")
              .update({
                stripe_subscription_status: sub.status,
                subscription_end_date: cancelAt,
                updated_at: new Date().toISOString(),
              })
              .eq("email", email);
          } else {
            // Active or immediately canceled
            console.log(
              `📝 Updating user ${email} → tier=${tier}, status=${sub.status}`
            );
            await supabaseAdmin.from("users").upsert(
              {
                email,
                tier,
                stripe_customer_id: sub.customer as string,
                stripe_subscription_status: sub.status,
                subscription_end_date: cancelAt ?? null,
                updated_at: new Date().toISOString(),
              },
              { onConflict: "email" }
            );
          }
        }
      }
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (err: any) {
    console.error("❌ Webhook error:", err);
    return NextResponse.json(
      { error: String(err?.message ?? err) },
      { status: 500 }
    );
  }
}
