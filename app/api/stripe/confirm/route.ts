// app/api/stripe/confirm/route.ts
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = false;

import { NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabase"; // your admin client (service role)

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2024-06-20" });

// --- helpers -----------------------------------------------------------------

function mapInterval(raw?: string | null): "monthly" | "annual" | null {
  return raw === "month" ? "monthly" : raw === "year" ? "annual" : null;
}

function isStripeCustomer(
  c: Stripe.Customer | Stripe.DeletedCustomer | null | undefined
): c is Stripe.Customer {
  return !!c && typeof c === "object" && ("deleted" in c ? (c as Stripe.DeletedCustomer).deleted === false : true) && "id" in c;
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

// --- main --------------------------------------------------------------------

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const sessionId = url.searchParams.get("session_id");
    if (!sessionId) {
      console.warn("[stripe/confirm] no session_id");
      return NextResponse.json({ ok: false, error: "no-session-id" }, { status: 400 });
    }

    // 1) Retrieve full session with expanded subscription & customer
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["subscription", "customer"],
    });

    const sub = session.subscription as Stripe.Subscription | null;

    const customerExpanded =
      typeof session.customer === "string" ? null : (session.customer as Stripe.Customer | Stripe.DeletedCustomer);

    const custId =
      typeof session.customer === "string"
        ? session.customer
        : isStripeCustomer(customerExpanded)
        ? customerExpanded.id
        : null;

    const customerEmail =
      session.customer_details?.email ??
      (isStripeCustomer(customerExpanded) ? customerExpanded.email : null) ??
      null;

    // 2) Resolve the target user id (NEVER rely on cookies here)
    let targetUserId =
      session.client_reference_id ||
      ((session.metadata as any)?.user_id as string | undefined) ||
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

    // 3) Compute mapped fields to match your DB
    const rawStatus = sub?.status ?? session.payment_status; // e.g., "active" | "trialing" | "paid"
    const mappedInterval = mapInterval(sub?.items?.data?.[0]?.plan?.interval ?? null); // "monthly" | "annual" | null
    const endIso = sub?.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null;
    const isPremium =
      rawStatus === "active" || rawStatus === "trialing" || session.payment_status === "paid";
    const emailLower = (customerEmail ?? "").toLowerCase();

    const basePayload = {
      id: targetUserId,
      email: emailLower,
      tier: isPremium ? "premium" : "free" as "premium" | "free",
      stripe_customer_id: custId,
      stripe_subscription_status: rawStatus ?? null,
      billing_interval: mappedInterval,
      subscription_end_date: endIso,
      updated_at: new Date().toISOString(),
    };

    // 4) First attempt: simple upsert by id
    let ensure = await supabaseAdmin
      .from("users")
      .upsert(basePayload, { onConflict: "id" })
      .select("id, email, tier")
      .maybeSingle();

    // 5) If we hit unique email collision, reconcile duplicates
    if (ensure.error?.code === "23505" && emailLower) {
      console.warn("[stripe/confirm] email unique collision; reconciling…", {
        email: emailLower,
        targetUserId,
      });

      // Fetch the row owning the email and the row for the target id
      const [{ data: byEmail }, { data: byId }] = await Promise.all([
        supabaseAdmin.from("users").select("id, email").eq("email", emailLower).maybeSingle(),
        supabaseAdmin.from("users").select("id, email").eq("id", targetUserId).maybeSingle(),
      ]);

      // A) Both exist and IDs differ: free email on old row → update correct row → (optional) delete dup
      if (byEmail?.id && byId?.id && byEmail.id !== byId.id) {
        const clr = await supabaseAdmin.from("users").update({ email: null }).eq("id", byEmail.id);
        if (clr.error) {
          console.error("[stripe/confirm] failed to clear email on dup row:", clr.error);
          return NextResponse.json({ ok: false, error: "clear-dup-email-failed" }, { status: 500 });
        }

        const upd = await supabaseAdmin
          .from("users")
          .update(basePayload)
          .eq("id", targetUserId)
          .select("id, email, tier")
          .maybeSingle();
        if (upd.error) {
          console.error("[stripe/confirm] failed to update target row:", upd.error);
          return NextResponse.json({ ok: false, error: "update-target-failed" }, { status: 500 });
        }

        // Optional cleanup: delete the dup row
        const del = await supabaseAdmin.from("users").delete().eq("id", byEmail.id);
        if (del.error) console.warn("[stripe/confirm] could not delete dup row (non-fatal):", del.error);

        ensure = { data: upd.data, error: null } as any;
      }
      // B) Email row exists but no row with the target id → try re-key; if not allowed, clear+insert
      else if (byEmail?.id && !byId?.id) {
        const rekey = await supabaseAdmin
          .from("users")
          .update({ id: targetUserId })
          .eq("id", byEmail.id);

        if (rekey.error) {
          // Fallback: clear email, insert new, then remove old
          await supabaseAdmin.from("users").update({ email: null }).eq("id", byEmail.id);
          const ins = await supabaseAdmin
            .from("users")
            .insert(basePayload)
            .select("id, email, tier")
            .maybeSingle();
          if (ins.error) {
            console.error("[stripe/confirm] fallback insert after clear failed:", ins.error);
            return NextResponse.json({ ok: false, error: "fallback-insert-failed" }, { status: 500 });
          }
          await supabaseAdmin.from("users").delete().eq("id", byEmail.id);
          ensure = { data: ins.data, error: null } as any;
        } else {
          const upd2 = await supabaseAdmin
            .from("users")
            .update(basePayload)
            .eq("id", targetUserId)
            .select("id, email, tier")
            .maybeSingle();
          if (upd2.error) {
            console.error("[stripe/confirm] update after rekey failed:", upd2.error);
            return NextResponse.json({ ok: false, error: "update-after-rekey-failed" }, { status: 500 });
          }
          ensure = { data: upd2.data, error: null } as any;
        }
      }
      // C) Only target-id row exists (or same row) → update it directly
      else if (byId?.id && (!byEmail || byEmail.id === byId.id)) {
        const upd = await supabaseAdmin
          .from("users")
          .update(basePayload)
          .eq("id", targetUserId)
          .select("id, email, tier")
          .maybeSingle();
        if (upd.error) {
          console.error("[stripe/confirm] update target row failed:", upd.error);
          return NextResponse.json({ ok: false, error: "update-target-failed" }, { status: 500 });
        }
        ensure = { data: upd.data, error: null } as any;
      }
      // D) Nothing matched (very unlikely) → insert without email, then set email
      else {
        const ins2 = await supabaseAdmin
          .from("users")
          .upsert({ ...basePayload, email: null }, { onConflict: "id" })
          .select("id, email, tier")
          .maybeSingle();
        if (ins2.error) {
          console.error("[stripe/confirm] last-resort upsert (no email) failed:", ins2.error);
          return NextResponse.json({ ok: false, error: "last-resort-upsert-failed" }, { status: 500 });
        }
        const setEmail = await supabaseAdmin
          .from("users")
          .update({ email: emailLower })
          .eq("id", targetUserId);
        if (setEmail.error) {
          console.warn("[stripe/confirm] could not set email (non-fatal):", setEmail.error);
        }
        ensure = { data: ins2.data, error: null } as any;
      }
    }

    if (ensure.error) {
      console.error("[stripe/confirm] upsert error (unhandled):", ensure.error);
      return NextResponse.json({ ok: false, error: "db-upsert-failed" }, { status: 500 });
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
