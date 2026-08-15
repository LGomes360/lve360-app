-- PR111: make structured safety findings evidence-grounded and auditable.
-- Existing rows remain available and are explicitly marked unreviewed until curated.

alter table public.interactions
  add column if not exists updated_at timestamptz default now(),
  add column if not exists source_label text,
  add column if not exists source_url text,
  add column if not exists source_type text default 'legacy_unknown',
  add column if not exists source_date date,
  add column if not exists last_reviewed_on date,
  add column if not exists exact_ingredient_form text,
  add column if not exists interaction_mechanism text,
  add column if not exists severity_rationale text,
  add column if not exists confidence text default 'unknown',
  add column if not exists user_qualification text,
  add column if not exists rule_version text default 'legacy-v1',
  add column if not exists provenance_status text default 'unreviewed';

alter table public.rules
  add column if not exists updated_at timestamptz default now(),
  add column if not exists source_label text,
  add column if not exists source_type text default 'legacy_unknown',
  add column if not exists source_date date,
  add column if not exists last_reviewed_on date,
  add column if not exists exact_ingredient_form text,
  add column if not exists interaction_mechanism text,
  add column if not exists severity_rationale text,
  add column if not exists confidence text default 'unknown',
  add column if not exists user_qualification text,
  add column if not exists rule_version text default 'legacy-v1',
  add column if not exists provenance_status text default 'unreviewed';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'interactions_confidence_check'
      and conrelid = 'public.interactions'::regclass
  ) then
    alter table public.interactions
      add constraint interactions_confidence_check
      check (confidence in ('high', 'moderate', 'low', 'unknown')) not valid;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'interactions_provenance_status_check'
      and conrelid = 'public.interactions'::regclass
  ) then
    alter table public.interactions
      add constraint interactions_provenance_status_check
      check (provenance_status in ('reviewed', 'unreviewed')) not valid;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'rules_confidence_check'
      and conrelid = 'public.rules'::regclass
  ) then
    alter table public.rules
      add constraint rules_confidence_check
      check (confidence in ('high', 'moderate', 'low', 'unknown')) not valid;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'rules_provenance_status_check'
      and conrelid = 'public.rules'::regclass
  ) then
    alter table public.rules
      add constraint rules_provenance_status_check
      check (provenance_status in ('reviewed', 'unreviewed')) not valid;
  end if;
end $$;

comment on column public.interactions.provenance_status is
  'reviewed means the typed evidence fields were curated; unreviewed means legacy provenance remains incomplete.';
comment on column public.rules.provenance_status is
  'reviewed means the typed evidence fields were curated; unreviewed means legacy provenance remains incomplete.';

-- Plain vitamin D is not an evidence-backed thyroid-medication binding rule.
update public.interactions
set binds_thyroid_meds = false,
    sep_hours_thyroid = null,
    source_label = 'NIH Office of Dietary Supplements: Vitamin D Fact Sheet for Health Professionals',
    source_url = 'https://ods.od.nih.gov/factsheets/VitaminD-HealthProfessional/',
    source_type = 'government_reference',
    last_reviewed_on = date '2026-08-15',
    exact_ingredient_form = 'Vitamin D3 (cholecalciferol)',
    interaction_mechanism = 'No general thyroid-medication binding mechanism identified in the reviewed source.',
    severity_rationale = 'Do not create a thyroid-spacing warning without an evidence-backed interaction.',
    confidence = 'high',
    user_qualification = 'This correction does not assess every individual product or clinical circumstance.',
    rule_version = 'safety-data-v2',
    provenance_status = 'reviewed'
where lower(ingredient) = 'vitamin d3';

-- The probiotic row keeps its antibiotic and immune-context cautions, but not
-- the unsupported thyroid-binding flag.
update public.interactions
set binds_thyroid_meds = false,
    sep_hours_thyroid = null,
    source_label = 'NCCIH: Probiotics, What Do We Know?',
    source_url = 'https://www.nccih.nih.gov/health/probiotics-usefulness-and-safety',
    source_type = 'government_reference',
    last_reviewed_on = date '2026-08-15',
    exact_ingredient_form = 'Lactobacillus/Bifidobacterium blend; strain details not recorded',
    interaction_mechanism = 'Product effects are strain-specific; no general thyroid-medication binding mechanism identified.',
    severity_rationale = 'Retain immune-context and antibiotic review while removing an unsupported thyroid-spacing warning.',
    confidence = 'moderate',
    user_qualification = 'Exact probiotic strain, dose, and product quality can change the safety assessment.',
    rule_version = 'safety-data-v2',
    provenance_status = 'reviewed'
where lower(ingredient) = 'probiotic (lacto/bifido blend)';

-- Magnesium remains a thyroid-medication spacing review. The best direct trial
-- studied liquid magnesium citrate/aspartate, so other forms are qualified.
update public.interactions
set binds_thyroid_meds = true,
    sep_hours_thyroid = 4,
    source_label = 'ThyroMag Trial (Clinical and Translational Science, 2025)',
    source_url = 'https://pmc.ncbi.nlm.nih.gov/articles/PMC12605969/',
    source_type = 'peer_reviewed',
    source_date = date '2025-11-13',
    last_reviewed_on = date '2026-08-15',
    exact_ingredient_form = ingredient,
    interaction_mechanism = 'Concurrent magnesium can reduce levothyroxine absorption through complexing; evidence varies by formulation.',
    severity_rationale = 'Reduced thyroid-medication absorption can affect treatment consistency, so timing should be reviewed.',
    confidence = 'moderate',
    user_qualification = 'The direct trial studied liquid magnesium citrate and aspartate. Follow the prescription label or pharmacist for the exact product and interval.',
    rule_version = 'safety-data-v2',
    provenance_status = 'reviewed'
where lower(ingredient) in ('magnesium', 'magnesium (glycinate)');

update public.rules
set source_label = 'NIH Office of Dietary Supplements: Vitamin D Fact Sheet for Health Professionals',
    source_url = 'https://ods.od.nih.gov/factsheets/VitaminD-HealthProfessional/',
    source_type = 'government_reference',
    last_reviewed_on = date '2026-08-15',
    exact_ingredient_form = 'Vitamin D from all sources',
    interaction_mechanism = 'Adult tolerable upper intake level; 1 mcg vitamin D equals 40 IU.',
    severity_rationale = 'Amounts above the adult UL require review; clinician-directed treatment can use higher amounts with monitoring.',
    confidence = 'high',
    user_qualification = 'The UL is a review threshold, not an instruction to stop a clinician-directed regimen.',
    rule_version = 'safety-data-v2',
    provenance_status = 'reviewed'
where upper(coalesce(rule_type, '')) = 'UL'
  and lower(coalesce(entity_a_name, '')) = 'vitamin d3';

update public.rules
set source_label = 'FDA Synthroid prescribing information (2024)',
    source_url = 'https://www.accessdata.fda.gov/drugsatfda_docs/label/2024/021402s038lbl.pdf',
    source_type = 'prescription_label',
    source_date = date '2024-06-01',
    last_reviewed_on = date '2026-08-15',
    exact_ingredient_form = 'Levothyroxine with calcium, iron, or identified magnesium-containing products',
    interaction_mechanism = 'Some co-administered products reduce levothyroxine absorption.',
    severity_rationale = 'Timing inconsistency can alter medication absorption and should be reviewed.',
    confidence = 'high',
    user_qualification = 'This rule does not apply to Vitamin D3 or probiotics. Use the prescription label or pharmacist instructions for the exact product.',
    rule_version = 'safety-data-v2',
    provenance_status = 'reviewed'
where lower(coalesce(trigger_name, '')) = 'thyroid_med';
