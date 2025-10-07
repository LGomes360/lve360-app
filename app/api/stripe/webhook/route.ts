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
        { error: "Webhook signature verification failed", details: String(err?.message ?? err) },
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
      .single();
    if (existing) {
      console.log("ℹ️ Duplicate webhook event ignored:", eventId);
      return NextResponse.json({ received: true, deduped: true }, { status: 200 });
    }

    await supabaseAdmin
      .from("stripe_events")
      .insert([{ id: eventId, raw: event, created_at: new Date().toISOString() }]);
    console.log("📦 Stored webhook event:", eventId);

    // ---- Handle checkout success ----
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      console.log("🎉 Checkout completed:", session.id);

      const email = session.customer_details?.email ?? session.metadata?.email ?? null;
      const stripeCustomerId = (session.customer as string) ?? null;

      console.log("➡️ Customer email:", email, "| Stripe Customer ID:", stripeCustomerId);

      if (email) {
        // Ensure auth.users exists
        const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 100 });
        let authId = list?.users?.find((u: any) => u.email === email)?.id ?? null;

        if (!authId) {
          console.log("👤 No auth user found, creating new user for:", email);
          const { data: created, error: createErr } =
            await supabaseAdmin.auth.admin.createUser({ email, email_confirm: true });
          if (createErr) console.error("❌ Error creating auth user:", createErr.message);
          authId = created?.user?.id ?? null;
        }

        // Upsert into users table with tier + stripe_customer_id
        if (authId) {
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
              updated_at: new Date().toISOString(),
            },
            { onConflict: "email" }
          );

          console.log(`📝 Upserting user ${authId} with tier=${chosenTier}`);
          await supabaseAdmin.from("users").upsert(
            {
              email,
              tier: chosenTier,
              stripe_customer_id: stripeCustomerId,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "email" }
          );
        }
      }

      // Persist subscription details
      let priceId: string | null = null;
      if (session.id) {
        const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 1 });
        priceId = lineItems.data[0]?.price?.id ?? session.metadata?.price_id ?? null;
        console.log("💵 Price ID from session:", priceId);
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

    // ---- Handle subscription lifecycle updates ----
    if (event.type.startsWith("customer.subscription.")) {
      const sub = event.data.object as Stripe.Subscription;
      console.log("🔄 Subscription update:", sub.id, "| Status:", sub.status);

      await supabaseAdmin.from("subscriptions").upsert({
        id: sub.id,
        customer: sub.customer,
        status: sub.status,
        raw: sub,
      });

      // Keep user in sync with stripe_customer_id
      if (sub.customer) {
        const customer = await stripe.customers.retrieve(sub.customer as string);
        const email = (customer as Stripe.Customer).email;

        console.log("📧 Subscription belongs to:", email);

        if (email) {
          const newTier = ["canceled", "unpaid", "incomplete_expired"].includes(sub.status)
            ? "free"
            : undefined;

          console.log(`📝 Updating user ${email} with newTier=${newTier ?? "unchanged"}, stripe_customer_id=${sub.customer}`);
          await supabaseAdmin
            .from("users")
            .upsert(
              {
                email,
                stripe_customer_id: sub.customer as string,
                stripe_subscription_status: sub.status,
                tier: newTier ?? "premium",
                updated_at: new Date().toISOString(),
              },
              { onConflict: "email" }
            );

        }
      }
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (err: any) {
    console.error("❌ Webhook error:", err);
    return NextResponse.json({ error: String(err?.message ?? err) }, { status: 500 });
  }
}
