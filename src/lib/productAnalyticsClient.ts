import type { ProductEventInput } from "@/lib/productAnalyticsTypes";

export function trackProductEvent(event: ProductEventInput): void {
  fetch("/api/analytics/event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(event),
    keepalive: true,
  }).catch(() => undefined);
}
