-- PR163: separate private-product access from payment state.
--
-- This migration is additive for existing members. It backfills the new access
-- fields from the legacy tier/Stripe columns but does not cancel, recreate, or
-- otherwise mutate any Stripe subscription.

alter table public.users
  add column access_status text not null default 'blueprint_only',
  add column billing_mode text not null default 'none',
  add column access_granted_at timestamptz,
  add column access_revoked_at timestamptz,
  add column access_source text;

alter table public.users
  add constraint users_access_status_check
    check (access_status in ('blueprint_only', 'private_member', 'suspended')),
  add constraint users_billing_mode_check
    check (billing_mode in ('none', 'complimentary', 'stripe_monthly', 'stripe_annual')),
  add constraint users_access_source_check
    check (
      access_source is null
      or access_source in (
        'legacy_stripe',
        'legacy_trial',
        'legacy_manual',
        'founder_invite',
        'support',
        'system'
      )
    );

update public.users
set
  access_status = case
    when tier in ('premium', 'trial') then 'private_member'
    else 'blueprint_only'
  end,
  billing_mode = case
    when tier in ('premium', 'trial') and stripe_customer_id is not null then
      case
        when billing_interval = 'annual' then 'stripe_annual'
        else 'stripe_monthly'
      end
    when tier in ('premium', 'trial') then 'complimentary'
    else 'none'
  end,
  access_granted_at = case
    when tier in ('premium', 'trial') then coalesce(updated_at, created_at, now())
    else null
  end,
  access_revoked_at = null,
  access_source = case
    when tier in ('premium', 'trial') and stripe_customer_id is not null then 'legacy_stripe'
    when tier = 'trial' then 'legacy_trial'
    when tier = 'premium' then 'legacy_manual'
    else null
  end;

comment on column public.users.access_status is
  'Founder-controlled access to the private LVE360 application, independent of billing.';
comment on column public.users.billing_mode is
  'How private access is funded. Stripe state remains in the existing Stripe columns.';
comment on column public.users.access_source is
  'Auditable reason private access was granted.';

-- During the staged rollout, existing application code still writes `tier`.
-- Keep the new columns synchronized for purchases and cancellations made
-- between this migration and the final private-access cutover. The later
-- cutover migration will remove this bridge so billing can no longer grant or
-- revoke access implicitly.
create schema if not exists private;

create or replace function private.sync_legacy_user_access()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.tier in ('premium', 'trial') then
      new.access_status := 'private_member';
      new.billing_mode := case
        when new.stripe_customer_id is null then 'complimentary'
        when new.billing_interval = 'annual' then 'stripe_annual'
        else 'stripe_monthly'
      end;
      new.access_granted_at := coalesce(new.access_granted_at, now());
      new.access_revoked_at := null;
      new.access_source := case
        when new.stripe_customer_id is not null then 'legacy_stripe'
        when new.tier = 'trial' then 'legacy_trial'
        else 'legacy_manual'
      end;
    end if;
  elsif old.tier is distinct from new.tier then
    if new.tier in ('premium', 'trial') then
      new.access_status := 'private_member';
      new.billing_mode := case
        when new.stripe_customer_id is null then 'complimentary'
        when new.billing_interval = 'annual' then 'stripe_annual'
        else 'stripe_monthly'
      end;
      new.access_granted_at := coalesce(new.access_granted_at, now());
      new.access_revoked_at := null;
      new.access_source := case
        when new.stripe_customer_id is not null then 'legacy_stripe'
        when new.tier = 'trial' then 'legacy_trial'
        else 'legacy_manual'
      end;
    elsif old.tier in ('premium', 'trial') then
      new.access_status := 'blueprint_only';
      new.billing_mode := 'none';
      new.access_revoked_at := now();
      new.access_source := 'system';
    end if;
  elsif new.tier in ('premium', 'trial') and (
    old.billing_interval is distinct from new.billing_interval
    or old.stripe_customer_id is distinct from new.stripe_customer_id
  ) then
    new.billing_mode := case
      when new.stripe_customer_id is null then 'complimentary'
      when new.billing_interval = 'annual' then 'stripe_annual'
      else 'stripe_monthly'
    end;
  end if;

  return new;
end;
$$;

revoke execute on function private.sync_legacy_user_access()
  from public, anon, authenticated, service_role;

create trigger sync_legacy_user_access
before insert or update of tier, billing_interval, stripe_customer_id
on public.users
for each row execute function private.sync_legacy_user_access();

-- public.users is account-control data. RLS limited writes to a member row, but
-- the authenticated role also had UPDATE privilege on tier and Stripe fields.
-- All profile creation and account-control writes already have trusted server
-- paths, so browser roles only need SELECT on their RLS-filtered row.
drop policy if exists "users: insert own" on public.users;
drop policy if exists "users: update own" on public.users;

revoke insert, update on table public.users from anon, authenticated;
grant select on table public.users to authenticated;

-- Rollback notes:
-- 1. Drop the five columns and three constraints added above.
-- 2. Drop trigger sync_legacy_user_access and function
--    private.sync_legacy_user_access().
-- 3. Recreate the former users: insert own and users: update own policies.
-- 4. Re-grant UPDATE to authenticated only if the former browser-write model is
--    intentionally restored. That rollback reopens writes to tier/Stripe fields
--    and is therefore not recommended.
