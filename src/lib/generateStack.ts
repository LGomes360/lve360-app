import { createClient } from '@supabase/supabase-js'

/**
 * A representation of a user submission from the intake form.
 */
export interface Submission {
  id?: string; // Now supports submissionId for fetching child tables
  goals: string[];
  healthConditions?: string[];
  medications?: string[];
  supplements?: string[];
  hormones?: string[];
  tier?: 'budget' | 'mid' | 'premium';
}

/**
 * A single item within a personalized supplement stack.
 */
export interface StackItem {
  supplement_id: string;
  name: string;
  dose: string;
  link: string | null;
  notes: string | null;
}

/**
 * Create a Supabase client using environment variables.
 */
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  { auth: { persistSession: false } }
);

/**
 * Generate a personalized supplement stack for a given submission.
 * Now pulls child tables (meds, userSupps, hormones) if `id` is present.
 */
export async function generateStack(
  submission: Submission
): Promise<StackItem[]> {
  const goals = submission.goals ?? [];
  const tier = submission.tier ?? 'budget';
  const health = submission.healthConditions ?? [];

  // --- NEW: If we have a submission.id, pull child tables. ---
  let meds: any[] = [];
  let userSupps: any[] = [];
  let hormones: any[] = [];

  if (submission.id) {
    const [
      { data: medsRaw },
      { data: userSuppsRaw },
      { data: hormonesRaw }
    ] = await Promise.all([
      supabase.from('submission_medications').select('*').eq('submission_id', submission.id),
      supabase.from('submission_supplements').select('*').eq('submission_id', submission.id),
      supabase.from('submission_hormones').select('*').eq('submission_id', submission.id),
    ]);
    meds = medsRaw ?? [];
    userSupps = userSuppsRaw ?? [];
    hormones = hormonesRaw ?? [];
  }

  // prefer structured over fallback flat fields
  const medsArr = meds.length > 0 ? meds.map(m => m.name) : (submission.medications ?? []);
  const userSuppsArr = userSupps.length > 0 ? userSupps.map(s => s.name) : (submission.supplements ?? []);
  // For future: pull hormone names if used in stack logic
  // const hormoneArr = hormones.length > 0 ? hormones.map(h => h.name) : (submission.hormones ?? []);

  // Step 1: look up rules that match any of the user's goals.
  const { data: rules, error: rulesError } = await supabase
    .from('rules')
    .select('*')
    .in('entity_a_name', goals);
  if (rulesError) {
    console.error('Error fetching rules', rulesError);
    return [];
  }

  // Filter out UL, SPACING and AVOID rules; these are handled separately.
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
    // with the user's health conditions or medications. We check a handful of
    // common caution flags; additional flags can be added as needed.
    let blocked = false;
    if (interact) {
      // Example: if the user is on anticoagulants and the supplement carries
      // bleeding risk, skip it.
      if (
        medsArr.some((m: string) =>
          m.toLowerCase().includes('anticoagulant')
        ) &&
        interact.anticoagulants_bleeding_risk === 'Y'
      ) {
        blocked = true;
      }
      // Example: pregnancy caution – skip if the user flagged pregnancy.
      if (
        health.some((h: string) => h.toLowerCase().includes('pregnancy')) &&
        interact.pregnancy_caution === 'Y'
      ) {
        blocked = true;
      }
      // Additional flags such as liver_disease_caution, kidney_disease_caution,
      // or immunocompromised_caution could be checked here.
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
