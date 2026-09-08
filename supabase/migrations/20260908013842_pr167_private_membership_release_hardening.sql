-- PR167: release-gate hardening for private membership.
-- Adds durable abuse protection, canonical request states, an append-only audit
-- trail, and a server-only erasure function. It does not enable invitations.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.invitation_request_rate_limits (
  request_hash text primary key,
  window_started_at timestamptz not null default now(),
  attempts integer not null default 1,
  updated_at timestamptz not null default now(),
  constraint invitation_request_rate_limit_hash_check check (request_hash ~ '^[0-9a-f]{64}$'),
  constraint invitation_request_rate_limit_attempts_check check (attempts between 1 and 10000)
);

alter table private.invitation_request_rate_limits enable row level security;
alter table private.invitation_request_rate_limits force row level security;
revoke all on table private.invitation_request_rate_limits from public, anon, authenticated, service_role;

create or replace function public.consume_invitation_request_rate_limit(
  p_request_hash text,
  p_limit integer default 5,
  p_window_seconds integer default 3600
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempts integer;
begin
  if p_request_hash !~ '^[0-9a-f]{64}$'
     or p_limit not between 1 and 100
     or p_window_seconds not between 60 and 86400 then
    return false;
  end if;

  insert into private.invitation_request_rate_limits (
    request_hash, window_started_at, attempts, updated_at
  ) values (
    p_request_hash, now(), 1, now()
  )
  on conflict (request_hash) do update
  set attempts = case
        when private.invitation_request_rate_limits.window_started_at <= now() - make_interval(secs => p_window_seconds)
          then 1
        else private.invitation_request_rate_limits.attempts + 1
      end,
      window_started_at = case
        when private.invitation_request_rate_limits.window_started_at <= now() - make_interval(secs => p_window_seconds)
          then now()
        else private.invitation_request_rate_limits.window_started_at
      end,
      updated_at = now()
  returning attempts into v_attempts;

  delete from private.invitation_request_rate_limits
  where updated_at < now() - interval '7 days';

  return v_attempts <= p_limit;
end;
$$;

revoke execute on function public.consume_invitation_request_rate_limit(text, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.consume_invitation_request_rate_limit(text, integer, integer)
  to service_role;

alter table public.access_requests
  drop constraint if exists access_requests_status_check;

update public.access_requests
set status = case status
  when 'pending' then 'submitted'
  when 'waitlisted' then 'reviewing'
  when 'revoked' then 'reviewing'
  else status
end;

alter table public.access_requests
  alter column status set default 'submitted',
  add constraint access_requests_status_check
    check (status in ('submitted', 'reviewing', 'approved', 'declined', 'withdrawn'));

create table if not exists public.access_request_events (
  id uuid primary key default gen_random_uuid(),
  access_request_id uuid not null references public.access_requests(id) on delete cascade,
  event_type text not null,
  from_status text,
  to_status text,
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint access_request_events_type_check check (
    event_type in (
      'request_submitted', 'review_changed', 'invitation_issued',
      'invitation_reissued', 'invitation_accepted', 'invitation_revoked',
      'invitation_rejected'
    )
  )
);

create index if not exists access_request_events_request_created_idx
  on public.access_request_events(access_request_id, created_at desc);
create index if not exists invitations_created_by_idx
  on public.invitations(created_by);

alter table public.access_request_events enable row level security;
alter table public.access_request_events force row level security;
revoke all on table public.access_request_events from public, anon, authenticated, service_role;
grant select, insert on table public.access_request_events to service_role;

insert into public.access_request_events (
  access_request_id, event_type, to_status, actor_id, created_at
)
select id, 'request_submitted', status, reviewed_by, created_at
from public.access_requests request
where not exists (
  select 1 from public.access_request_events event
  where event.access_request_id = request.id
);

create or replace function private.audit_access_request_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.access_request_events (
      access_request_id, event_type, to_status, actor_id
    ) values (
      new.id, 'request_submitted', new.status, new.reviewed_by
    );
  elsif new.status is distinct from old.status
     or new.founder_notes is distinct from old.founder_notes then
    insert into public.access_request_events (
      access_request_id, event_type, from_status, to_status, actor_id
    ) values (
      new.id, 'review_changed', old.status, new.status, new.reviewed_by
    );
  end if;
  return new;
end;
$$;

revoke execute on function private.audit_access_request_change()
  from public, anon, authenticated, service_role;

drop trigger if exists access_request_audit_trigger on public.access_requests;
create trigger access_request_audit_trigger
after insert or update of status, founder_notes on public.access_requests
for each row execute function private.audit_access_request_change();

create or replace function private.audit_invitation_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_type text;
  v_actor_id uuid;
begin
  if tg_op = 'INSERT' then
    v_event_type := 'invitation_issued';
    v_actor_id := new.created_by;
  elsif new.status = 'accepted' and old.status is distinct from new.status then
    v_event_type := 'invitation_accepted';
    v_actor_id := new.accepted_by;
  elsif new.status = 'revoked' and old.status is distinct from new.status then
    v_event_type := 'invitation_revoked';
    v_actor_id := new.created_by;
  elsif new.token_hash is distinct from old.token_hash then
    v_event_type := 'invitation_reissued';
    v_actor_id := new.created_by;
  else
    return new;
  end if;

  insert into public.access_request_events (
    access_request_id, event_type, actor_id
  ) values (
    new.access_request_id, v_event_type, v_actor_id
  );
  return new;
end;
$$;

revoke execute on function private.audit_invitation_change()
  from public, anon, authenticated, service_role;

drop trigger if exists invitation_audit_trigger on public.invitations;
create trigger invitation_audit_trigger
after insert or update of status, token_hash on public.invitations
for each row execute function private.audit_invitation_change();

create or replace function private.guard_invitation_request_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.access_requests
    where id = new.access_request_id and status in ('declined', 'withdrawn')
  ) then
    raise exception 'request is not eligible for invitation';
  end if;
  return new;
end;
$$;

revoke execute on function private.guard_invitation_request_status()
  from public, anon, authenticated, service_role;

drop trigger if exists invitation_request_status_guard on public.invitations;
create trigger invitation_request_status_guard
before insert or update of token_hash on public.invitations
for each row execute function private.guard_invitation_request_status();

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
  set status = 'reviewing', reviewed_at = now(), reviewed_by = p_founder_id, updated_at = now()
  where id = v_request_id;
  return true;
end;
$$;

revoke execute on function public.revoke_private_invitation(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.revoke_private_invitation(uuid, uuid) to service_role;

create or replace function public.record_private_invitation_rejection(
  p_token_hash text,
  p_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request_id uuid;
begin
  if p_token_hash !~ '^[0-9a-f]{64}$' then return false; end if;

  select access_request_id into v_request_id
  from public.invitations
  where token_hash = p_token_hash;

  if v_request_id is null then return false; end if;
  insert into public.access_request_events (
    access_request_id, event_type, actor_id
  ) values (
    v_request_id, 'invitation_rejected', p_user_id
  );
  return true;
end;
$$;

revoke execute on function public.record_private_invitation_rejection(text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.record_private_invitation_rejection(text, uuid) to service_role;

create or replace function public.delete_invitation_request_data(
  p_email text,
  p_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if not exists (
    select 1 from auth.users
    where id = p_user_id and lower(email) = v_email
  ) then
    return false;
  end if;

  delete from public.invitations
  where access_request_id in (
    select id from public.access_requests where email = v_email
  );
  delete from public.access_requests where email = v_email;
  return true;
end;
$$;

revoke execute on function public.delete_invitation_request_data(text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.delete_invitation_request_data(text, uuid) to service_role;

comment on table private.invitation_request_rate_limits is
  'Hashed abuse-control counters. Raw IP addresses are never stored.';
comment on table public.access_request_events is
  'Append-only state history for founder review and private invitations.';

-- Rollback: disable issuance, drop the three triggers and their private
-- functions, drop public.access_request_events and the private rate-limit
-- table, restore the prior request status constraint, then drop the two new
-- public functions. Preserve exported audit data before any rollback.
