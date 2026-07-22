import "server-only";

import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import type { ProductEventInput } from "@/lib/productAnalyticsTypes";

type ServerProductEvent = ProductEventInput & {
  visitor_id?: string | null;
  user_id?: string | null;
  event_key?: string | null;
};

export async function recordProductEvent(event: ServerProductEvent): Promise<void> {
  if (!event.visitor_id && !event.user_id) return;
  const payload = {
    visitor_id: event.visitor_id ?? null,
    user_id: event.user_id ?? null,
    experiment_id: event.experiment_id ?? null,
    event_name: event.event_name,
    source: event.source,
    plan: event.plan ?? null,
    step: event.step ?? null,
    event_key: event.event_key ?? null,
  };
  const admin = getSupabaseAdmin();
  const result = event.event_key
    ? await admin.from("product_events").upsert(payload, { onConflict: "event_key", ignoreDuplicates: true })
    : await admin.from("product_events").insert(payload);
  if (result.error) throw result.error;
}

export async function recordProductEventSafely(event: ServerProductEvent): Promise<void> {
  try {
    await recordProductEvent(event);
  } catch (error) {
    console.warn("[product-analytics] event not recorded", event.event_name, error);
  }
}
