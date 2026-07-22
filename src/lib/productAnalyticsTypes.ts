export const PRODUCT_EVENT_NAMES = [
  "homepage_viewed",
  "pricing_viewed",
  "intake_started",
  "intake_completed",
  "blueprint_viewed",
  "blueprint_action_selected",
  "checkout_started",
  "checkout_completed",
  "activation_started",
  "activation_completed",
  "practice_completed",
  "check_in_completed",
  "weekly_review_opened",
  "weekly_review_completed",
  "subscription_cancelled",
] as const;

export const PRODUCT_EVENT_SOURCES = [
  "homepage",
  "pricing",
  "tally",
  "results",
  "upgrade",
  "stripe",
  "onboarding",
  "today",
  "daily_log",
  "weekly_review",
] as const;

export type ProductEventName = (typeof PRODUCT_EVENT_NAMES)[number];
export type ProductEventSource = (typeof PRODUCT_EVENT_SOURCES)[number];
export type ProductPlan = "monthly" | "annual";

export type ProductEventInput = {
  event_name: ProductEventName;
  source: ProductEventSource;
  plan?: ProductPlan | null;
  step?: number | null;
  experiment_id?: string | null;
};

export function isProductEventName(value: unknown): value is ProductEventName {
  return typeof value === "string" && PRODUCT_EVENT_NAMES.includes(value as ProductEventName);
}

export function isProductEventSource(value: unknown): value is ProductEventSource {
  return typeof value === "string" && PRODUCT_EVENT_SOURCES.includes(value as ProductEventSource);
}

export function validateProductEvent(value: unknown): ProductEventInput | null {
  if (!value || typeof value !== "object") return null;
  const event = value as Record<string, unknown>;
  if (!isProductEventName(event.event_name) || !isProductEventSource(event.source)) return null;
  const plan = event.plan == null ? null : event.plan;
  if (plan !== null && plan !== "monthly" && plan !== "annual") return null;
  const step = event.step == null ? null : Number(event.step);
  if (step !== null && (!Number.isInteger(step) || step < 0 || step > 6)) return null;
  const experimentId = event.experiment_id == null ? null : event.experiment_id;
  if (experimentId !== null && (typeof experimentId !== "string" || !/^[0-9a-f-]{36}$/i.test(experimentId))) return null;
  return {
    event_name: event.event_name,
    source: event.source,
    plan,
    step,
    experiment_id: experimentId,
  };
}
