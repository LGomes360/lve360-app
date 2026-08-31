-- PR123 data-only copy correction.
-- Purpose: prefer "clinician or healthcare provider" in reviewed member-facing
-- safety qualifications while preserving the internal pharmacist authority
-- value and every safety rule, threshold, source, and evidence field.

update public.interactions
set user_qualification = 'The direct trial studied liquid magnesium citrate and aspartate. Follow the prescription label or guidance from your clinician or healthcare provider for the exact product and interval.'
where lower(ingredient) in ('magnesium', 'magnesium (glycinate)')
  and user_qualification = 'The direct trial studied liquid magnesium citrate and aspartate. Follow the prescription label or pharmacist for the exact product and interval.';

update public.rules
set user_qualification = 'This rule does not apply to Vitamin D3 or probiotics. Use the prescription label or guidance from your clinician or healthcare provider for the exact product.'
where lower(coalesce(trigger_name, '')) = 'thyroid_med'
  and user_qualification = 'This rule does not apply to Vitamin D3 or probiotics. Use the prescription label or pharmacist instructions for the exact product.';

-- Rollback notes:
-- Restore the two prior user_qualification strings above with equally narrow
-- predicates. Do not rename or remove the internal instruction_authority value
-- "pharmacist" because it records provenance and drives safety behavior.
