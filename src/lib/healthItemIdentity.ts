function simpleKey(value: string): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[.*_`#]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Stable ingredient identity used for regimen matching and deduplication.
 * This is deliberately narrower than evidence matching: two ingredients may
 * share an evidence source without being interchangeable regimen items.
 */
export function healthItemIdentityKey(value: string): string {
  const key = simpleKey(value);
  if (!key) return "";

  if (/^(?:vitamin )?b ?12(?: methylcobalamin)?$/.test(key) || key === "methylcobalamin") return "vitamin-b12";
  if (/^(?:vitamin )?d ?3?$/.test(key) || key === "cholecalciferol") return "vitamin-d";
  if (/^(?:magnesium )?(?:l )?threonate$/.test(key) || key === "magtein") return "magnesium-threonate";
  if (/^magnesium (?:bis)?glycinate$/.test(key)) return "magnesium-glycinate";
  if (/^magnesium citrate$/.test(key)) return "magnesium-citrate";
  if (/^magnesium malate$/.test(key)) return "magnesium-malate";
  if (/^magnesium taurate$/.test(key)) return "magnesium-taurate";
  if (/^magnesium oxide$/.test(key)) return "magnesium-oxide";
  if (/^magnesium chloride$/.test(key)) return "magnesium-chloride";
  if (/^magnesium sulfate$/.test(key) || key === "epsom salt") return "magnesium-sulfate";
  if (key === "magnesium") return "magnesium-unspecified";
  if (/^(?:omega ?3|fish oil|epa dha)$/.test(key)) return "omega-3";
  if (/^(?:vitamin )?b complex$/.test(key) || key === "b vitamins") return "b-complex";
  if (/^(?:coq ?10|ubiquinone|ubiquinol)$/.test(key)) return "coq10";
  if (/^(?:creatine|creatine monohydrate)$/.test(key)) return "creatine-monohydrate";

  return key.replace(/ /g, "-");
}

export function canonicalHealthItemDisplayName(value: string): string {
  const trimmed = String(value ?? "").replace(/[.*_`#]/g, "").replace(/\s+/g, " ").trim();
  switch (healthItemIdentityKey(trimmed)) {
    case "vitamin-b12": return "Vitamin B12";
    case "vitamin-d": return "Vitamin D";
    case "magnesium-threonate": return "Magnesium Threonate";
    case "magnesium-glycinate": return "Magnesium Glycinate";
    case "magnesium-citrate": return "Magnesium Citrate";
    case "magnesium-malate": return "Magnesium Malate";
    case "magnesium-taurate": return "Magnesium Taurate";
    case "magnesium-oxide": return "Magnesium Oxide";
    case "magnesium-chloride": return "Magnesium Chloride";
    case "magnesium-sulfate": return "Magnesium Sulfate";
    case "magnesium-unspecified": return "Magnesium";
    case "omega-3": return "Omega-3";
    case "b-complex": return "B-Complex";
    case "coq10": return "CoQ10";
    case "creatine-monohydrate": return "Creatine Monohydrate";
    default: return trimmed;
  }
}

type IntegrityItem = {
  name: string;
  dose?: string | null;
  timing?: string | null;
  is_current?: boolean | null;
};

function exactInstruction(value: string | null | undefined): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export function validateGeneratedHealthItemIntegrity(
  currentItems: IntegrityItem[],
  persistedItems: IntegrityItem[],
  proposedItems: IntegrityItem[] = [],
): string[] {
  const issues: string[] = [];
  const currentByKey = new Map<string, IntegrityItem>();
  for (const item of currentItems) {
    const key = healthItemIdentityKey(item.name);
    if (!key) continue;
    if (currentByKey.has(key)) issues.push(`duplicate-current-identity:${key}`);
    currentByKey.set(key, item);
  }

  const persistedCurrentByKey = new Map(
    persistedItems
      .filter((item) => item.is_current === true)
      .map((item) => [healthItemIdentityKey(item.name), item] as const)
      .filter(([key]) => Boolean(key)),
  );

  for (const [key, current] of currentByKey) {
    const persisted = persistedCurrentByKey.get(key);
    if (!persisted) {
      issues.push(`missing-current-item:${current.name}`);
      continue;
    }
    if (exactInstruction(persisted.dose) !== exactInstruction(current.dose)) {
      issues.push(`changed-current-dose:${current.name}`);
    }
    if (exactInstruction(persisted.timing) !== exactInstruction(current.timing)) {
      issues.push(`changed-current-timing:${current.name}`);
    }
  }

  for (const proposal of proposedItems) {
    const key = healthItemIdentityKey(proposal.name);
    if (key && currentByKey.has(key)) issues.push(`current-item-proposed-as-new:${proposal.name}`);
  }

  return Array.from(new Set(issues));
}
