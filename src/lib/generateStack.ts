import { createClient } from '@supabase/supabase-js';

export interface StackItem {
  supplement_id: string;
  name: string;
  dose: string;
  link: string | null;
  notes: string | null;
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  { auth: { persistSession: false } }
);

export async function generateStack(submissionId: string): Promise<StackItem[]> {
  // 1. Fetch submission and children
  const { data: submission, error } = await supabase
    .from('submissions')
    .select('*')
    .eq('id', submissionId)
    .single();

  if (error || !submission) {
    console.error('Submission not found', error);
    return [];
  }

  // 2. Fetch child tables (all rows for this submission)
  const [{ data: meds = [] }, { data: userSupps = [] }, { data: hormones = [] }] = await Promise.all([
    supabase.from('submission_medications').select('*').eq('submission_id', submissionId),
    supabase.from('submission_supplements').select('*').eq('submission_id', submissionId),
    supabase.from('submission_hormones').select('*').eq('submission_id', submissionId),
  ]);

  // 3. Normalize for stack logic
  const goals = submission.goals || [];
  const tier = submission.tier || 'budget';
  // prefer structured over fallback flat fields
  const health = submission.conditions || []; // can merge with hormones if needed
  const medsArr = meds.length > 0 ? meds.map(m => m.name) : (submission.medications || []);
  const userSuppsArr = userSupps.length > 0 ? userSupps.map(s => s.name) : (submission.supplements || []);
  // For future: pull hormone names if used in stack logic

  // 4. Find rules that match user goals
  const { data: rules, error: rulesError } = await supabase
    .from('rules')
    .select('*')
    .in('entity_a_name', goals);

  if (rulesError) {
    console.error('Error fetching rules', rulesError);
    return [];
  }

  // 5. Filter out non-stack rules
  const candidateIngredients =
    rules
      ?.filter(
        (r: any) =>
          r.rule_type !== 'UL' &&
          r.rule_type !== 'SPACING' &&
          r.rule_type !== 'AVOID'
      )
      .map((r: any) => r.counterparty_name)
      .filter((name: any) => !!name) ?? [];

  const stack: StackItem[] = [];

  for (const ingredient of candidateIngredients) {
    // Fetch the appropriate supplement entry for the desired tier.
    const { data: supp, error: suppError } = await supabase
      .from('supplements')
      .select('*')
      .eq('ingredient', ingredient)
      .eq('tier', tier)
      .single();
    if (suppError || !supp) {
      console.warn(`No supplement found for ingredient ${ingredient}`, suppError);
      continue;
    }

    // Fetch the interaction flags for this ingredient.
    const { data: interact, error: interactError } = await supabase
      .from('interactions')
      .select('*')
      .eq('ingredient', ingredient)
      .single();
    if (interactError) {
      console.warn(
        `Failed to fetch interactions for ingredient ${ingredient}`,
        interactError
      );
    }

    // Block by medication or health condition
    let blocked = false;
    if (interact) {
      if (
        medsArr.some((m: string) =>
          m.toLowerCase().includes('anticoagulant')
        ) &&
        interact.anticoagulants_bleeding_risk === 'Y'
      ) {
        blocked = true;
      }
      if (
        health.some((h: string) => h.toLowerCase().includes('pregnancy')) &&
        interact.pregnancy_caution === 'Y'
      ) {
        blocked = true;
      }
      if (
        health.some((h: string) => h.toLowerCase().includes('liver')) &&
        interact.liver_disease_caution === 'Y'
      ) {
        blocked = true;
      }
      if (
        health.some((h: string) => h.toLowerCase().includes('kidney')) &&
        interact.kidney_disease_caution === 'Y'
      ) {
        blocked = true;
      }
    }

    if (blocked) {
      continue;
    }

    stack.push({
      supplement_id: supp.id as string,
      name: supp.ingredient as string,
      dose: supp.dose as string,
      link: (supp.link ?? null) as string | null,
      notes: (supp.notes ?? null) as string | null,
    });
  }

  return stack;
}
