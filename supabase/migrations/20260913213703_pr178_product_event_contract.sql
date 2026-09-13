alter table public.product_events
  drop constraint if exists product_events_name;

alter table public.product_events
  add constraint product_events_name check (event_name in (
    'homepage_viewed', 'login_started', 'pricing_viewed', 'intake_started',
    'intake_page_viewed', 'intake_completed', 'blueprint_viewed',
    'blueprint_action_selected', 'blueprint_version_selected',
    'blueprint_input_change_started', 'blueprint_input_change_saved',
    'blueprint_refresh_started', 'blueprint_refresh_completed',
    'blueprint_refresh_failed', 'blueprint_pdf_opened',
    'blueprint_handoff_ready', 'blueprint_handoff_retry',
    'recommendation_viewed', 'recommendation_reason_opened',
    'checkout_started', 'checkout_completed', 'activation_started',
    'activation_completed', 'practice_completed', 'check_in_completed',
    'weekly_review_opened', 'weekly_review_completed', 'reminder_sent',
    'reminder_failed', 'reminder_opted_out', 'subscription_cancelled'
  ));

alter table public.product_events
  drop constraint if exists product_events_source;

alter table public.product_events
  add constraint product_events_source check (source in (
    'homepage', 'login', 'pricing', 'tally', 'results', 'blueprints',
    'upgrade', 'stripe', 'onboarding', 'today', 'daily_log',
    'weekly_review', 'reminders', 'settings'
  ));

comment on constraint product_events_name on public.product_events is
  'Approved privacy-safe product event names. Keep aligned with PRODUCT_EVENT_NAMES.';

comment on constraint product_events_source on public.product_events is
  'Approved privacy-safe product event sources. Keep aligned with PRODUCT_EVENT_SOURCES.';

-- Rollback: restore product_events_name and product_events_source from
-- 20260826004608_pr131_paid_beta_learning_scorecard.sql and
-- 20260729035142_interactive_blueprint_versions.sql respectively.
