export async function generateStack(submission: Submission): Promise<StackItem[]> {
  const goals = submission.goals ?? [];
  const tier = submission.tier ?? 'budget';
  const health = submission.healthConditions ?? [];
  const meds = submission.medications ?? [];

  console.log('Submission:', { goals, tier, health, meds });

  // 1. Rules
  const { data: rules, error: rulesError } = await supabase
    .from('rules')
    .select('*')
    .in('entity_a_name', goals);
  if (rulesError) {
    console.error('Error fetching rules', rulesError);
    return [];
  }
  console.log('Matching rules:', rules);

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

  console.log('Candidate ingredients:', candidateIngredients);

  const stack: StackItem[] = [];

  for (const ingredient of candidateIngredients) {
    // 2. Supplements
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
    console.log('Found supplement:', supp);

    // 3. Interactions
    const { data: interact, error: interactError } = await supabase
      .from('interactions')
      .select('*')
      .eq('ingredient', ingredient)
      .single();

    if (interactError) {
      console.warn(`Failed to fetch interactions for ingredient ${ingredient}`, interactError);
    }

    let blocked = false;
    if (interact) {
      // ... (existing exclusion logic)
    }

    if (blocked) {
      console.log(`Blocked by interaction: ${ingredient}`);
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

  console.log('Final stack:', stack);
  return stack;
}
