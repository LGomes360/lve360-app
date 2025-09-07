import { createClient } from '@supabase/supabase-js'

export interface Submission {
  id?: string; // Submission UUID for pulling child tables
  goals: string[];
  healthConditions?: string[];
  medications?: string[];
  supplements?: string[];
  hormones?: string[];
  tier?: 'budget' | 'mid' | 'premium';
}

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

export async function generateStack(
  submission: Submission
): Promise<StackItem[]> {
  const goals = submission.goals ?? [];
  const tier = submission.tier ?? 'budget';
  const health = submission.healthConditions ?? [];

  // --- Pull child tables if submission.id is present ---
  let meds: any[] = [];
  let userSupps: any[] = [];
  let hormones: any[] = [];

  if (submission.id) {
    const [
      { data: medsRaw },
      { data: userSuppsRaw },
      { data: hormonesRaw }
    ] = await Promise.all([
      supabase.from('submission_medications').select('name').eq('submission_id', submission.id),
      supabase.from('submission_supplements').select('name').eq('submission_id', submission.id),
      supabase.from('submission_hormones').select('name').eq('submission_id', submission.id),
    ]);
    meds = medsRaw ?? [];
    userSupps = userSuppsRaw ?? [];
    hormones = hormonesRaw ?? [];
  }

  // Prefer structured (child tables), fallback to flat array fields
  const medsArr = meds.length > 0 ? meds.map(m => m.name) : (submission.medications ?? []);
  const userSuppsArr = userSupps.length > 0 ? userSupps.map(s => s.name) : (submission.supplements ?? []);
  // Hormones ready for future use if needed:
  // const hormoneArr = hormones.length > 0 ? hormones.map(h => h.name) : (submission.hormones ?? []);

  // --- Step 1: Get rules matching user goals ---
  const { data: rules, error: rulesError } = await supabase
    .from('rules')
    .select('*')
    .in('entity_a_name', goals);
  if (rulesError) {
    console.error('Error fetching rules', rulesError);
    return [];
  }

  // Filter out rules not meant for stack generation
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

    // Determine if this supplement should be excluded based on interactions
    let blocked = false;
    if (interact) {
      // Medications
      if (
        medsArr.some((m: string) =>
          m.toLowerCase().includes('anticoagulant')
        ) &&
        interact.anticoagulants_bleeding_risk === 'Y'
      ) {
        blocked = true;
      }
      // Pregnancy
      if (
        health.some((h: string) => h.toLowerCase().includes('pregnancy')) &&
        interact.pregnancy_caution === 'Y'
      ) {
        blocked = true;
      }
      // Liver caution
      if (
        health.some((h: string) => h.toLowerCase().includes('liver')) &&
        interact.liver_disease_caution === 'Y'
      ) {
        blocked = true;
      }
      // Kidney caution
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
