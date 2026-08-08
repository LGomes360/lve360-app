alter table public.stacks
  add column if not exists safety_acknowledged_at timestamptz;

comment on column public.stacks.safety_acknowledged_at is
  'When the owning member acknowledged the safety notes for this exact Blueprint version.';
