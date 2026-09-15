import { NextResponse, type NextRequest } from "next/server";

import { reminderOperationErrorCode } from "@/lib/reminderReliability";
import {
  applyReminderProviderEvent,
  verifyReminderProviderEvent,
  type ReminderProviderEvent,
} from "@/lib/reminderWebhook";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET?.trim();
  if (!webhookSecret) {
    return NextResponse.json({ ok: false, error: "webhook_not_configured" }, { status: 503 });
  }

  const payload = await req.text();
  let event: ReminderProviderEvent;
  try {
    event = verifyReminderProviderEvent(webhookSecret, payload, {
      "svix-id": req.headers.get("svix-id") ?? "",
      "svix-timestamp": req.headers.get("svix-timestamp") ?? "",
      "svix-signature": req.headers.get("svix-signature") ?? "",
    });
  } catch {
    console.warn("[resend-webhook] signature rejected");
    return NextResponse.json({ ok: false, error: "invalid_signature" }, { status: 400 });
  }

  try {
    const outcome = await applyReminderProviderEvent(event, async (update) => {
      const admin = getSupabaseAdmin();
      const eventValues = {
        status: update.status,
        provider_event_type: update.eventType,
        provider_event_at: update.eventAt,
        updated_at: new Date().toISOString(),
      };
      const result = await admin
        .from("reminder_deliveries")
        .update(eventValues)
        .eq("provider_id", update.providerId)
        .or(`provider_event_at.is.null,provider_event_at.lte.${update.eventAt}`)
        .select("id")
        .limit(1);
      if (result.error || result.data?.length || !update.deliveryId) {
        return { ...result, updated: Boolean(result.data?.length) };
      }
      const fallback = await admin
        .from("reminder_deliveries")
        .update({ ...eventValues, provider_id: update.providerId })
        .eq("id", update.deliveryId)
        .eq("status", "queued")
        .is("provider_id", null)
        .or(`provider_event_at.is.null,provider_event_at.lte.${update.eventAt}`)
        .select("id")
        .limit(1);
      return {
        ...fallback,
        updated: Boolean(fallback.data?.length),
      };
    });
    return NextResponse.json(outcome === "updated" ? { ok: true } : { ok: true, ignored: true });
  } catch (error) {
    console.error("[resend-webhook] ledger update failed", {
      code: reminderOperationErrorCode(error),
    });
    return NextResponse.json({ ok: false, error: "ledger_update_failed" }, { status: 503 });
  }
}
