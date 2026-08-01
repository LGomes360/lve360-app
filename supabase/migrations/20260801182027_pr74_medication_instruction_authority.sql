-- PR74: preserve who supplied a member-recorded medication instruction.
alter table public.current_regimen_items
  add column if not exists instruction_authority text;

alter table public.current_regimen_items
  drop constraint if exists current_regimen_items_instruction_authority_check;

alter table public.current_regimen_items
  add constraint current_regimen_items_instruction_authority_check
  check (
    instruction_authority is null
    or instruction_authority in ('clinician', 'pharmacist', 'medication_label')
  );

comment on column public.current_regimen_items.instruction_authority is
  'Member-reported source for medication instructions. This records provenance and is not an LVE360 recommendation.';
