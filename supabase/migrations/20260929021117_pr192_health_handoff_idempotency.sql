-- PR192: make approved ChatGPT Health handoffs safely repeatable.
-- Existing rows remain valid. New MCP writes receive a deterministic content
-- fingerprint so retrying the exact approved summary returns the original row.

alter table public.health_context_handoffs
  add column if not exists submission_fingerprint text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'health_context_handoffs_fingerprint_format_check'
      and conrelid = 'public.health_context_handoffs'::regclass
  ) then
    alter table public.health_context_handoffs
      add constraint health_context_handoffs_fingerprint_format_check
      check (
        submission_fingerprint is null
        or submission_fingerprint ~ '^[0-9a-f]{64}$'
      );
  end if;
end
$$;

create unique index if not exists health_context_handoffs_user_fingerprint_idx
  on public.health_context_handoffs (user_id, submission_fingerprint);

comment on column public.health_context_handoffs.submission_fingerprint is
  'SHA-256 of the validated approved handoff. Used only to make exact retries idempotent.';

-- Rollback: drop health_context_handoffs_user_fingerprint_idx, then drop the
-- format constraint and submission_fingerprint column. Existing summaries are
-- otherwise unchanged.
