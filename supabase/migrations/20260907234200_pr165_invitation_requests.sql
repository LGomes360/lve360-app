-- PR165: founder-reviewed invitation request queue.
-- This migration does not create invitation credentials or admit users.

create table if not exists public.access_requests (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  first_name text not null,
  organizing_help text not null,
  interests text[] not null default '{}',
  request_reason text,
  referral_source text,
  referral_code text,
  status text not null default 'pending',
  founder_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  constraint access_requests_email_unique unique (email),
  constraint access_requests_email_normalized check (email = lower(btrim(email)) and length(email) between 3 and 320),
  constraint access_requests_first_name_length check (length(btrim(first_name)) between 1 and 80),
  constraint access_requests_organizing_help_length check (length(btrim(organizing_help)) between 1 and 500),
  constraint access_requests_request_reason_length check (request_reason is null or length(request_reason) <= 1000),
  constraint access_requests_referral_source_length check (referral_source is null or length(referral_source) <= 120),
  constraint access_requests_referral_code_length check (referral_code is null or length(referral_code) <= 120),
  constraint access_requests_founder_notes_length check (founder_notes is null or length(founder_notes) <= 2000),
  constraint access_requests_status_check check (status in ('pending', 'approved', 'declined', 'waitlisted', 'revoked'))
);

create index if not exists access_requests_status_created_at_idx on public.access_requests(status, created_at desc);
create index if not exists access_requests_reviewed_by_idx on public.access_requests(reviewed_by) where reviewed_by is not null;

alter table public.access_requests enable row level security;
alter table public.access_requests force row level security;

revoke all on table public.access_requests from public, anon, authenticated, service_role;
grant select, insert, update on table public.access_requests to service_role;

comment on table public.access_requests is 'Minimal private-membership requests. Server-only access; no detailed health data.';

-- Rollback (only if PR165 has not collected data):
-- drop table if exists public.access_requests;
