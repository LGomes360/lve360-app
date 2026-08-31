alter table public.product_events drop constraint if exists product_events_name;
alter table public.product_events add constraint product_events_name check (event_name in (
  'homepage_viewed', 'pricing_viewed', 'intake_started', 'intake_page_viewed',
  'intake_completed', 'blueprint_viewed', 'blueprint_action_selected',
  'blueprint_version_selected', 'blueprint_input_change_started',
  'blueprint_input_change_saved', 'blueprint_refresh_started',
  'blueprint_refresh_completed', 'blueprint_refresh_failed',
  'blueprint_pdf_opened', 'blueprint_handoff_ready', 'blueprint_handoff_retry',
  'recommendation_viewed', 'recommendation_reason_opened',
  'checkout_started', 'checkout_completed', 'activation_started',
  'activation_completed', 'practice_completed', 'check_in_completed',
  'weekly_review_opened', 'weekly_review_completed', 'reminder_sent',
  'reminder_failed', 'reminder_opted_out', 'subscription_cancelled'
));

create or replace view analytics.paid_beta_learning_scorecard
with (security_invoker = true)
as
with visitor_identity as (
  select
    visitor_id,
    min(user_id::text)::uuid as user_id
  from public.product_events
  where visitor_id is not null
    and user_id is not null
  group by visitor_id
  having count(distinct user_id) = 1
),
resolved_events as (
  select
    coalesce(events.user_id, identity.user_id) as user_id,
    events.event_name,
    events.created_at
  from public.product_events events
  left join visitor_identity identity on identity.visitor_id = events.visitor_id
),
paid_members as (
  select users.id as user_id
  from public.users users
  where users.tier in ('trial', 'premium')
     or users.stripe_customer_id is not null
     or exists (
       select 1 from resolved_events events
       where events.user_id = users.id and events.event_name = 'checkout_completed'
     )
),
checkout_members as (
  select distinct user_id
  from resolved_events
  where user_id is not null and event_name = 'checkout_completed'
),
blueprint_members as (
  select distinct user_id
  from resolved_events
  where user_id is not null and event_name = 'blueprint_viewed'
),
activation_candidates as (
  select user_id, activated_at as occurred_at
  from public.weekly_experiments
  where activated_at is not null
  union all
  select user_id, created_at
  from resolved_events
  where user_id is not null and event_name = 'activation_completed'
),
first_activation as (
  select user_id, min(occurred_at) as activated_at
  from activation_candidates
  group by user_id
),
activated_paid_members as (
  select paid.user_id, activation.activated_at
  from paid_members paid
  join first_activation activation using (user_id)
),
intention_members as (
  select distinct user_id
  from public.daily_intentions
  where nullif(btrim(phrase), '') is not null
),
recommendation_viewers as (
  select distinct user_id
  from resolved_events
  where user_id is not null and event_name = 'recommendation_viewed'
),
recommendation_reason_openers as (
  select distinct user_id
  from resolved_events
  where user_id is not null and event_name = 'recommendation_reason_opened'
),
practice_members as (
  select distinct user_id from public.daily_practice_completions
),
adapted_members as (
  select distinct user_id
  from public.weekly_experiment_reviews
  where status = 'completed' and decision in ('shrink', 'swap', 'advance')
),
skipped_members as (
  select distinct user_id
  from public.weekly_experiment_reviews
  where status = 'completed' and decision = 'pause'
),
meaningful_activity as (
  select user_id, created_at as occurred_at
  from resolved_events
  where user_id is not null
    and event_name in (
      'practice_completed', 'check_in_completed', 'weekly_review_opened',
      'weekly_review_completed', 'recommendation_viewed',
      'recommendation_reason_opened'
    )
  union all
  select user_id, created_at from public.daily_practice_completions
  union all
  select user_id, updated_at from public.daily_intentions
  where nullif(btrim(phrase), '') is not null
  union all
  select user_id, created_at from public.ai_coaching_turns
  where generation_status = 'succeeded'
),
day_7_eligible as (
  select user_id, activated_at
  from activated_paid_members
  where activated_at <= now() - interval '7 days'
),
day_7_returned as (
  select distinct eligible.user_id
  from day_7_eligible eligible
  join meaningful_activity activity
    on activity.user_id = eligible.user_id
   and activity.occurred_at >= eligible.activated_at + interval '7 days'
   and activity.occurred_at < eligible.activated_at + interval '14 days'
),
second_week_members as (
  select experiments.user_id
  from public.weekly_experiments experiments
  where experiments.activated_at is not null
  group by experiments.user_id
  having count(*) >= 2
),
scorecard_counts as (
  select
    (select count(*) from blueprint_members)::bigint as blueprint_members,
    (select count(*) from blueprint_members blueprint join checkout_members checkout using (user_id))::bigint as blueprint_to_paid,
    (select count(*) from paid_members)::bigint as paid_members,
    (select count(*) from activated_paid_members)::bigint as activated_members,
    (select count(*) from activated_paid_members activated join intention_members intentions using (user_id))::bigint as intention_members,
    (select count(*) from activated_paid_members activated join recommendation_viewers viewers using (user_id))::bigint as recommendation_viewers,
    (select count(*) from recommendation_viewers)::bigint as all_recommendation_viewers,
    (select count(*) from recommendation_viewers viewers join recommendation_reason_openers openers using (user_id))::bigint as recommendation_reason_openers,
    (select count(*) from activated_paid_members activated join practice_members practice using (user_id))::bigint as action_completers,
    (select count(*) from activated_paid_members activated join adapted_members adapted using (user_id))::bigint as action_adapters,
    (select count(*) from activated_paid_members activated join skipped_members skipped using (user_id))::bigint as action_skippers,
    (select count(*) from public.ai_coaching_turns where feedback = 'useful')::bigint as useful_coach_turns,
    (select count(*) from public.ai_coaching_turns where feedback is not null)::bigint as rated_coach_turns,
    (select count(*) from day_7_eligible)::bigint as day_7_eligible,
    (select count(*) from day_7_returned)::bigint as day_7_returned,
    (select count(*) from day_7_eligible eligible join second_week_members week_two using (user_id))::bigint as second_week_members,
    (select count(*) from paid_members paid join public.users users on users.id = paid.user_id where users.tier in ('trial', 'premium'))::bigint as active_subscriptions,
    (select count(distinct user_id) from resolved_events where user_id is not null and event_name = 'subscription_cancelled')::bigint as cancelled_subscriptions
)
select
  metrics.metric_key,
  metrics.metric_label,
  metrics.numerator,
  metrics.denominator,
  case
    when metrics.denominator = 0 then null
    else round(metrics.numerator::numeric / metrics.denominator, 4)
  end as rate,
  metrics.definition,
  now() as as_of
from scorecard_counts counts
cross join lateral (
  values
    ('blueprint_to_paid_conversion', 'Blueprint to paid conversion', counts.blueprint_to_paid, counts.blueprint_members, 'Identified Blueprint viewers who later completed checkout.'),
    ('activation', 'Paid member activation', counts.activated_members, counts.paid_members, 'Paid or trial members who activated a weekly practice.'),
    ('intention_set', 'Daily intention set', counts.intention_members, counts.activated_members, 'Activated paid members who saved at least one daily intention.'),
    ('recommendation_viewed', 'Recommendation viewed', counts.recommendation_viewers, counts.activated_members, 'Activated paid members who viewed the live Blueprint recommendation layer.'),
    ('reason_opened', 'Recommendation reason opened', counts.recommendation_reason_openers, counts.all_recommendation_viewers, 'Recommendation viewers who opened at least one supporting reason.'),
    ('action_completed', 'Action completed', counts.action_completers, counts.activated_members, 'Activated paid members who recorded at least one daily practice completion.'),
    ('action_adapted', 'Action adapted', counts.action_adapters, counts.activated_members, 'Activated paid members who used shrink, swap, or advance in a completed weekly review.'),
    ('action_skipped', 'Action skipped', counts.action_skippers, counts.activated_members, 'Activated paid members who paused an action in a completed weekly review.'),
    ('ask_lve360_usefulness', 'Ask LVE360 usefulness', counts.useful_coach_turns, counts.rated_coach_turns, 'Rated coaching turns marked useful.'),
    ('day_7_return', 'Day 7 return', counts.day_7_returned, counts.day_7_eligible, 'Eligible activated paid members with meaningful activity during days 7 through 13.'),
    ('second_week_start', 'Second week started', counts.second_week_members, counts.day_7_eligible, 'Eligible activated paid members who activated at least two weekly practices.'),
    ('subscription_active', 'Subscription active', counts.active_subscriptions, counts.paid_members, 'Paid-history members whose current tier still permits the member experience.'),
    ('subscription_cancelled', 'Subscription cancelled', counts.cancelled_subscriptions, counts.paid_members, 'Paid-history members with a verified subscription cancellation event.')
) as metrics(metric_key, metric_label, numerator, denominator, definition);

revoke all on analytics.paid_beta_learning_scorecard from public, anon, authenticated;
grant select on analytics.paid_beta_learning_scorecard to service_role;

comment on view analytics.paid_beta_learning_scorecard is
  'Privacy-safe paid-beta learning metrics. One row per decision metric; no health values or freeform member text.';
