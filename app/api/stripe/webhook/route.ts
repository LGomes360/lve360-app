// app/api/stripe/webhook/route.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabase";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "", { apiVersion: "2023-10-16" });

export async function POST(req: NextRequest) {
  try {
    const sig = (req.headers.get("stripe-signature") ?? "").toString();
    const buf = await req.arrayBuffer();
    const raw = Buffer.from(buf);

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(raw, sig, process.env.STRIPE_WEBHOOK_SECRET ?? "");
    } catch (err: any) {
      return NextResponse.json(
        { error: "Webhook signature verification failed", details: String(err?.message ?? err) },
        { status: 400 }
      );
    }

    // Deduplicate events
    const eventId = event.id;
    const { data: existing } = await supabaseAdmin
      .from("stripe_events")
      .select("id")
      .eq("id", eventId)
      .single();
    if (existing) return NextResponse.json({ received: true, deduped: true }, { status: 200 });

    await supabaseAdmin.from("stripe_events").insert([
      { id: eventId, raw: event, created_at: new Date().toISOString() },
    ]);

    // ---- Handle checkout success ----
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const email = session.customer_details?.email ?? session.metadata?.email ?? null;

      if (email) {
        // 1. Ensure auth.users exists
        // Try to find auth user by email
        const { data: list, error: listErr } = await supabaseAdmin.auth.admin.listUsers({
          page: 1,
          perPage: 1,
        });
        if (listErr) console.error("Error listing users:", listErr.message);
        
        let authId = list?.users?.find((u: any) => u.email === email)?.id ?? null;
        
        // If user doesn’t exist, create one
        if (!authId) {
          const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
            email,
            email_confirm: true,
          });
          if (createErr) console.error("Error creating auth user:", createErr.message);
          authId = created?.user?.id ?? null;
        }


        // 2. Upsert into your users table
        if (authId) {
          await supabaseAdmin.from("users").upsert(
            { id: authId, email, tier: "premium" },
            { onConflict: "id" }
          );
        }
      }

      // 3. Persist subscription details
      if (session.subscription) {
        const subscriptionId = session.subscription as string;
        await supabaseAdmin.from("subscriptions").upsert({
          id: subscriptionId,
          customer: session.customer,
          price: session.metadata?.price_id ?? null,
          status: "active",
          raw: session,
        });
      }
    }

    // ---- Handle subscription lifecycle updates ----
    if (event.type.startsWith("customer.subscription.")) {
      const sub = event.data.object as Stripe.Subscription;

      // Store subscription row
      await supabaseAdmin.from("subscriptions").upsert({
        id: sub.id,
        customer: sub.customer,
        status: sub.status,
        raw: sub,
      });

      // ---- Downgrade user if canceled or unpaid ----
      if (["canceled", "unpaid", "incomplete_expired"].includes(sub.status)) {
        // Lookup customer’s email
        const customer = await stripe.customers.retrieve(sub.customer as string);
        const email = (customer as Stripe.Customer).email;

        if (email) {
          await supabaseAdmin.from("users").update({ tier: "free" }).eq("email", email);
        }
      }
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (err: any) {
    console.error("Webhook error:", err);
    return NextResponse.json({ error: String(err?.message ?? err) }, { status: 500 });
  }
}
