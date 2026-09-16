-- Keep the private analytics schema out of the Data API while giving the
-- server-only founder dashboard a deliberately narrow reporting endpoint.
create or replace function public.founder_paid_beta_learning_scorecard()
returns table (
  metric_key text,
  metric_label text,
  numerator bigint,
  denominator bigint,
  rate numeric,
  definition text,
  as_of timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    scorecard.metric_key,
    scorecard.metric_label,
    scorecard.numerator,
    scorecard.denominator,
    scorecard.rate,
    scorecard.definition,
    scorecard.as_of
  from analytics.paid_beta_learning_scorecard scorecard;
$$;

revoke all on function public.founder_paid_beta_learning_scorecard()
  from public, anon, authenticated, service_role;
grant execute on function public.founder_paid_beta_learning_scorecard()
  to service_role;

comment on function public.founder_paid_beta_learning_scorecard() is
  'Service-role-only Data API bridge for the aggregate paid-beta learning scorecard. Returns no member health records or freeform text.';
