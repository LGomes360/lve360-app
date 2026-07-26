alter table public.product_events
  drop constraint if exists product_events_name;

alter table public.product_events
  add constraint product_events_name check (event_name in (
    'homepage_viewed', 'pricing_viewed', 'intake_started', 'intake_page_viewed',
    'intake_completed', 'blueprint_viewed', 'blueprint_action_selected',
    'checkout_started', 'checkout_completed', 'activation_started',
    'activation_completed', 'practice_completed', 'check_in_completed',
    'weekly_review_opened', 'weekly_review_completed', 'subscription_cancelled'
  ));

comment on column public.product_events.step is
  'Small ordinal step for bounded flows. For intake_page_viewed this is the Tally page number.';
