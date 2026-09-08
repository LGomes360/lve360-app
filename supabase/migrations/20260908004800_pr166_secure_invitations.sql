-- PR166: hashed, single-use invitations and atomic private-access acceptance.

create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  access_request_id uuid not null references public.access_requests(id) on delete restrict,
  email text not null,
  token_hash text not null,
  status text not null default 'issued',
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id) on delete restrict,
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  constraint invitations_access_request_unique unique (access_request_id),
  constraint invitations_token_hash_unique unique (token_hash),
  constraint invitations_token_hash_format check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint invitations_email_normalized check (email = lower(btrim(email)) and length(email) between 3 and 320),
  constraint invitations_status_check check (status in ('issued', 'accepted', 'revoked')),
  constraint invitations_acceptance_consistent check (
    (status = 'accepted' and accepted_at is not null and accepted_by is not null and revoked_at is null)
    or (status = 'revoked' and revoked_at is not null and accepted_at is null and accepted_by is null)
    or (status = 'issued' and accepted_at is null and accepted_by is null and revoked_at is null)
  )
);

create index if not exists invitations_status_expires_at_idx on public.invitations(status, expires_at);
create index if not exists invitations_accepted_by_idx on public.invitations(accepted_by) where accepted_by is not null;

alter table public.invitations enable row level security;
alter table public.invitations force row level security;
revoke all on table public.invitations from public, anon, authenticated, service_role;
grant select, insert, update on table public.invitations to service_role;

create or replace function public.issue_private_invitation(
  p_request_id uuid,
  p_token_hash text,
  p_founder_id uuid
)
returns table(invitation_id uuid, invite_email text, invite_expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.access_requests%rowtype;
  v_invitation public.invitations%rowtype;
begin
  if p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid invitation hash';
  end if;
  if not exists (select 1 from auth.users where id = p_founder_id) then
    raise exception 'founder account not found';
  end if;

  select * into v_request
  from public.access_requests
  where id = p_request_id
  for update;

  if not found or v_request.status = 'declined' then
    raise exception 'request is not eligible for invitation';
  end if;

  select * into v_invitation
  from public.invitations
  where access_request_id = p_request_id
  for update;

  if found and v_invitation.status = 'accepted' then
    raise exception 'invitation has already been accepted';
  end if;

  if v_invitation.id is null then
    insert into public.invitations (
      access_request_id, email, token_hash, status, expires_at, created_by
    ) values (
      p_request_id, v_request.email, p_token_hash, 'issued', now() + interval '7 days', p_founder_id
    ) returning * into v_invitation;
  else
    update public.invitations
    set token_hash = p_token_hash,
        email = v_request.email,
        status = 'issued',
        expires_at = now() + interval '7 days',
        created_at = now(),
        created_by = p_founder_id,
        accepted_at = null,
        accepted_by = null,
        revoked_at = null
    where id = v_invitation.id
    returning * into v_invitation;
  end if;

  update public.access_requests
  set status = 'approved',
      reviewed_at = now(),
      reviewed_by = p_founder_id,
      updated_at = now()
  where id = p_request_id;

  return query select v_invitation.id, v_invitation.email, v_invitation.expires_at;
end;
$$;

create or replace function public.accept_private_invitation(
  p_token_hash text,
  p_user_id uuid,
  p_email text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invitation public.invitations%rowtype;
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if p_token_hash !~ '^[0-9a-f]{64}$' then return false; end if;
  if not exists (
    select 1 from auth.users
    where id = p_user_id and lower(email) = v_email and email_confirmed_at is not null
  ) then return false; end if;

  select * into v_invitation
  from public.invitations
  where token_hash = p_token_hash
    and status = 'issued'
    and accepted_at is null
    and revoked_at is null
    and expires_at > now()
    and email = v_email
  for update;

  if not found then return false; end if;

  perform public.reconcile_user_and_attach_v2(v_email, p_user_id);

  update public.users
  set tier = case when tier in ('trial', 'premium') then tier else 'premium' end,
      updated_at = now()
  where id = p_user_id;

  update public.users
  set access_status = 'private_member',
      billing_mode = case
        when stripe_customer_id is null then 'complimentary'
        when billing_interval = 'annual' then 'stripe_annual'
        else 'stripe_monthly'
      end,
      access_granted_at = coalesce(access_granted_at, now()),
      access_revoked_at = null,
      access_source = case
        when stripe_customer_id is null then 'founder_invite'
        else coalesce(access_source, 'legacy_stripe')
      end,
      updated_at = now()
  where id = p_user_id;

  update public.invitations
  set status = 'accepted', accepted_at = now(), accepted_by = p_user_id
  where id = v_invitation.id;

  update public.access_requests
  set status = 'approved', reviewed_at = coalesce(reviewed_at, now()), updated_at = now()
  where id = v_invitation.access_request_id;

  return true;
end;
$$;

create or replace function public.revoke_private_invitation(
  p_invitation_id uuid,
  p_founder_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request_id uuid;
begin
  if not exists (select 1 from auth.users where id = p_founder_id) then return false; end if;

  update public.invitations
  set status = 'revoked', revoked_at = now()
  where id = p_invitation_id and status = 'issued' and accepted_at is null
  returning access_request_id into v_request_id;

  if v_request_id is null then return false; end if;

  update public.access_requests
  set status = 'revoked', reviewed_at = now(), reviewed_by = p_founder_id, updated_at = now()
  where id = v_request_id;
  return true;
end;
$$;

revoke all on function public.issue_private_invitation(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.accept_private_invitation(text, uuid, text) from public, anon, authenticated;
revoke all on function public.revoke_private_invitation(uuid, uuid) from public, anon, authenticated;
grant execute on function public.issue_private_invitation(uuid, text, uuid) to service_role;
grant execute on function public.accept_private_invitation(text, uuid, text) to service_role;
grant execute on function public.revoke_private_invitation(uuid, uuid) to service_role;

comment on table public.invitations is 'Single-use private-access invitations. Raw bearer tokens are never stored.';

-- Rollback: drop the three functions, then drop public.invitations. Do not roll
-- back after invitations are issued without first revoking outstanding links.
