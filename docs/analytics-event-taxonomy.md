# LVE360 product analytics taxonomy

## Purpose

This ledger measures whether the free Blueprint leads to a paid weekly practice loop. It is not a health-record system and must never receive health values or freeform user text.

## Privacy contract

Allowed fields are deliberately narrow:

- `event_name`: one event from the table below
- `source`: one approved product surface
- `visitor_id`: random first-party browser identifier
- `user_id`: internal LVE360 user identifier when known
- `experiment_id`: internal weekly-experiment identifier when relevant
- `plan`: `monthly` or `annual`
- `step`: activation step 0 through 6
- `event_key`: server-generated idempotency key
- `created_at`: server timestamp

Never send names, email addresses, intake answers, goals, conditions, medication names, supplement names, lab values, report text, action text, cues, check-in values, IP addresses, or user-agent strings.

## Events

| Event | Trigger | Source | Identity |
| --- | --- | --- | --- |
| `homepage_viewed` | Homepage loads | `homepage` | Visitor, plus member when signed in |
| `pricing_viewed` | Pricing page loads | `pricing` | Visitor, plus member when signed in |
| `intake_started` | A Tally intake modal opens | `homepage` or `pricing` | Visitor |
| `intake_completed` | A valid Tally submission is stored | `tally` | Member |
| `blueprint_viewed` | A usable Blueprint is displayed | `results` | Visitor, plus member when signed in |
| `blueprint_action_selected` | A lifestyle action is handed off | `results` | Visitor, plus member when signed in |
| `blueprint_handoff_ready` | A Blueprint handoff is ready for a member | `blueprints` | Visitor, plus member when signed in |
| `blueprint_handoff_retry` | A member retries an incomplete Blueprint handoff | `blueprints` | Visitor, plus member when signed in |
| `recommendation_viewed` | A member sees the live recommendation decision layer | `blueprints` | Member |
| `recommendation_reason_opened` | A member opens the reason for a recommendation | `blueprints` | Member |
| `checkout_started` | Member requests Stripe checkout | `upgrade` | Visitor and member |
| `checkout_completed` | Verified Stripe checkout webhook succeeds | `stripe` | Member |
| `activation_started` | First weekly-experiment draft is created | `onboarding` | Member and experiment |
| `activation_completed` | First-week setup is activated | `onboarding` | Member and experiment |
| `practice_completed` | Full or minimum daily practice is saved | `today` | Member and experiment |
| `check_in_completed` | Daily check-in is saved | `daily_log` | Member |
| `weekly_review_opened` | A due weekly review loads | `weekly_review` | Member and experiment |
| `weekly_review_completed` | Review and rollover transaction succeeds | `weekly_review` | Member and experiment |
| `subscription_cancelled` | Verified Stripe webhook schedules or completes a cancellation | `stripe` | Member |

## Metric definitions

### Weekly Activated Members (WAM)

Distinct members who complete at least one focused practice or weekly review in a calendar week. This measures continued use of the paid operating loop, not page visits or passive logins.

Query `analytics.weekly_activated_members`.

### Retention cohorts

A member enters a cohort in the calendar week of their first `activation_completed` event. A member is retained in week 2, 4, 8, or 12 when they complete a focused practice or weekly review in that target calendar week.

Query `analytics.retention_cohorts`.

### Funnel

Query `analytics.funnel_weekly` for weekly event totals, unique browser visitors, and unique identified members. Visitor continuity is established with the first-party `lve_visitor_id` cookie. Events recorded after authentication contain both visitor and member identifiers, allowing the anonymous and authenticated portions of a journey to be joined without collecting email in analytics.

### Paid-beta learning scorecard

Query `analytics.paid_beta_learning_scorecard` for one privacy-safe operator view. Each row has a metric key, label, numerator, denominator, rate, plain-language definition, and query timestamp.

The scorecard uses canonical product records where they already exist. It uses the analytics ledger only for page-level behavior that has no durable product record. Its metrics cover Blueprint-to-paid conversion, paid activation, daily intention selection, recommendation and rationale engagement, practice completion and adaptation, Ask LVE360 usefulness, Day 7 return, second-week start, and subscription lifecycle.

## Operating checks

```sql
select * from analytics.funnel_weekly order by week_start desc, event_name;
select * from analytics.weekly_activated_members order by week_start desc;
select * from analytics.retention_cohorts order by cohort_week desc, week_number;
select * from analytics.paid_beta_learning_scorecard order by metric_key;
```

Review this taxonomy before adding an event or field. New properties require an explicit privacy review and a database constraint update.
