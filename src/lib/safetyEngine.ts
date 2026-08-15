import { canonicalHealthItemDisplayName, healthItemIdentityKey } from "./healthItemIdentity.ts";

export type SafetySeverity = "info" | "warning" | "danger";
export type SafetyDecision = "clear" | "review" | "blocked";
export type SafetySource = "interactions" | "rules" | "intake" | "system";

export interface SafetyContext {
  medications?: string[];
  conditions?: string[];
  allergies?: string[];
  procedures?: string[];
  pregnant?: boolean | string | null;
}

export interface SafetyCandidate {
  name: string;
  dose?: string | null;
  is_current?: boolean;
  instruction_authority?: string | null;
}

export interface SafetyEvidenceProvenance {
  sourceLabel: string | null;
  sourceUrl: string | null;
  sourceType: string;
  sourceDate: string | null;
  lastReviewedOn: string | null;
  exactIngredientForm: string | null;
  mechanism: string | null;
  severityRationale: string | null;
  confidence: "high" | "moderate" | "low" | "unknown";
  qualification: string | null;
  ruleVersion: string;
  provenanceStatus: "reviewed" | "unreviewed";
}

interface SafetyProvenanceRow {
  source_label?: string | null;
  source_url?: string | null;
  source_type?: string | null;
  source_date?: string | null;
  last_reviewed_on?: string | null;
  exact_ingredient_form?: string | null;
  interaction_mechanism?: string | null;
  severity_rationale?: string | null;
  confidence?: string | null;
  user_qualification?: string | null;
  rule_version?: string | null;
  provenance_status?: string | null;
}

export interface InteractionRow extends SafetyProvenanceRow {
  ingredient: string;
  binds_thyroid_meds?: boolean | null;
  sep_hours_thyroid?: number | null;
  anticoagulants_bleeding_risk?: boolean | null;
  diabetes_meds_additive?: boolean | null;
  sedatives_additive?: boolean | null;
  antibiotics_interaction?: boolean | null;
  pregnancy_caution?: boolean | null;
  liver_disease_caution?: boolean | null;
  kidney_disease_caution?: boolean | null;
  immunocompromised_caution?: boolean | null;
  caffeine_stimulant_caution?: boolean | null;
  liver_caution?: boolean | null;
  kidney_caution?: boolean | null;
  notes?: string | null;
}

export interface SafetyRuleRow extends SafetyProvenanceRow {
  rule_id?: string | null;
  rule_type?: string | null;
  action?: string | null;
  entity_a_name?: string | null;
  max_daily_amount?: number | string | null;
  unit?: string | null;
  message?: string | null;
  source_url?: string | null;
  trigger_name?: string | null;
  severity?: string | null;
  notes?: string | null;
  caution?: string | null;
}

export interface SafetyFinding {
  code: string;
  item: string;
  message: string;
  severity: SafetySeverity;
  decision: Exclude<SafetyDecision, "clear">;
  source: SafetySource;
  sourceUrl?: string | null;
  evidence?: SafetyEvidenceProvenance;
}

export interface SafetyCandidateResult {
  name: string;
  isCurrent: boolean;
  decision: SafetyDecision;
  findings: SafetyFinding[];
}

export interface SafetyEvaluation {
  complete: boolean;
  status: SafetyDecision;
  candidates: SafetyCandidateResult[];
  findings: SafetyFinding[];
}

export interface SafetySources {
  interactions: InteractionRow[];
  rules: SafetyRuleRow[];
}

const THYROID_MED_RE = /\b(?:levothyroxine|synthroid|levoxyl|unithroid|tirosint|liothyronine|cytomel|armour\s+thyroid|np\s+thyroid|thyroid\s+med)/i;
const ANTICOAGULANT_RE = /\b(?:warfarin|coumadin|apixaban|eliquis|rivaroxaban|xarelto|dabigatran|pradaxa|edoxaban|savaysa|heparin|enoxaparin|lovenox|clopidogrel|plavix|anticoagulant|blood\s+thinner)/i;
const GLUCOSE_MED_RE = /\b(?:metformin|insulin|semaglutide|ozempic|wegovy|rybelsus|tirzepatide|mounjaro|zepbound|dulaglutide|trulicity|liraglutide|victoza|saxenda|glipizide|glyburide|glimepiride|empagliflozin|jardiance|dapagliflozin|farxiga|diabetes\s+med)/i;
const SEDATIVE_RE = /\b(?:eszopiclone|lunesta|zolpidem|ambien|alprazolam|xanax|lorazepam|ativan|clonazepam|klonopin|diazepam|valium|temazepam|restoril|trazodone|quetiapine|seroquel|sedative|sleep\s+med)/i;
const ANTIBIOTIC_RE = /\b(?:ciprofloxacin|cipro|doxycycline|tetracycline|minocycline|amoxicillin|azithromycin|antibiotic)/i;
const IMMUNOSUPPRESSANT_RE = /\b(?:tacrolimus|cyclosporine|azathioprine|mycophenolate|methotrexate|immunosuppress)/i;
const STIMULANT_RE = /\b(?:amphetamine|adderall|dextroamphetamine|vyvanse|lisdexamfetamine|methylphenidate|ritalin|concerta|stimulant)/i;
const SSRI_SNRI_MAOI_RE = /\b(?:sertraline|zoloft|fluoxetine|prozac|escitalopram|lexapro|citalopram|celexa|paroxetine|paxil|venlafaxine|effexor|duloxetine|cymbalta|phenelzine|nardil|tranylcypromine|parnate|ssri|snri|maoi)/i;
const RECOGNIZED_MED_RE = new RegExp([
  THYROID_MED_RE.source,
  ANTICOAGULANT_RE.source,
  GLUCOSE_MED_RE.source,
  SEDATIVE_RE.source,
  ANTIBIOTIC_RE.source,
  IMMUNOSUPPRESSANT_RE.source,
  STIMULANT_RE.source,
  SSRI_SNRI_MAOI_RE.source,
].join("|"), "i");

function normalize(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(?:extract|powder|capsules?|tablets?|softgels?|hcl)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stringList(values?: string[]): string[] {
  return (values ?? []).map((value) => String(value ?? "").trim()).filter(Boolean);
}

function contextMatches(values: string[], pattern: RegExp): boolean {
  return values.some((value) => pattern.test(value));
}

function isPregnant(value: SafetyContext["pregnant"]): boolean {
  return value === true || /^(?:yes|true|pregnant)$/i.test(String(value ?? "").trim());
}

function interactionMatches(name: string, rows: InteractionRow[]): InteractionRow[] {
  const candidate = normalize(name);
  return rows.filter((row) => {
    const ingredient = normalize(row.ingredient);
    return ingredient === candidate ||
      (ingredient.length >= 5 && candidate.startsWith(ingredient)) ||
      (candidate.length >= 5 && ingredient.startsWith(candidate));
  });
}

function mergedInteraction(name: string, rows: InteractionRow[]): InteractionRow | undefined {
  const matches = interactionMatches(name, rows);
  if (!matches.length) return undefined;
  const evidenceRow = [...matches].sort((left, right) => {
    const reviewed = Number(right.provenance_status === "reviewed") - Number(left.provenance_status === "reviewed");
    if (reviewed) return reviewed;
    return normalize(right.ingredient).length - normalize(left.ingredient).length;
  })[0];
  const flag = (key: keyof InteractionRow) => matches.some((row) => row[key] === true);
  const spacing = matches.map((row) => row.sep_hours_thyroid).filter((value): value is number => typeof value === "number");
  return {
    ingredient: name,
    binds_thyroid_meds: flag("binds_thyroid_meds"),
    sep_hours_thyroid: spacing.length ? Math.max(...spacing) : null,
    anticoagulants_bleeding_risk: flag("anticoagulants_bleeding_risk"),
    diabetes_meds_additive: flag("diabetes_meds_additive"),
    sedatives_additive: flag("sedatives_additive"),
    antibiotics_interaction: flag("antibiotics_interaction"),
    pregnancy_caution: flag("pregnancy_caution"),
    liver_disease_caution: flag("liver_disease_caution"),
    kidney_disease_caution: flag("kidney_disease_caution"),
    immunocompromised_caution: flag("immunocompromised_caution"),
    caffeine_stimulant_caution: flag("caffeine_stimulant_caution"),
    liver_caution: flag("liver_caution"),
    kidney_caution: flag("kidney_caution"),
    notes: matches.map((row) => row.notes).filter(Boolean).join(" ") || null,
    source_label: evidenceRow.source_label,
    source_url: evidenceRow.source_url,
    source_type: evidenceRow.source_type,
    source_date: evidenceRow.source_date,
    last_reviewed_on: evidenceRow.last_reviewed_on,
    exact_ingredient_form: evidenceRow.exact_ingredient_form,
    interaction_mechanism: evidenceRow.interaction_mechanism,
    severity_rationale: evidenceRow.severity_rationale,
    confidence: evidenceRow.confidence,
    user_qualification: evidenceRow.user_qualification,
    rule_version: evidenceRow.rule_version,
    provenance_status: evidenceRow.provenance_status,
  };
}

function nameAppearsInText(name: string, text: string): boolean {
  const candidate = normalize(name);
  const haystack = normalize(text);
  if (!candidate || !haystack) return false;
  const firstWord = candidate.split(" ")[0];
  return haystack.includes(candidate) || (firstWord.length >= 4 && haystack.includes(firstWord));
}

function allergyMatchesCandidate(allergy: string, candidate: string): boolean {
  const a = normalize(allergy);
  const c = normalize(candidate);
  if (!a || !c || /^(?:seasonal|environmental|pollen|none|n a)$/.test(a)) return false;
  return a === c || a.includes(c) || c.includes(a);
}

function parseDose(dose?: string | null): { amount: number; unit: string } | null {
  const match = String(dose ?? "").match(/(\d+(?:\.\d+)?)\s*([a-zµμ]+)\b/i);
  if (!match) return null;
  return { amount: Number(match[1]), unit: match[2].toLowerCase().replace("µg", "mcg").replace("μg", "mcg").replace("ug", "mcg") };
}

function comparableRuleUnit(unit?: string | null): string {
  const source = String(unit ?? "").toLowerCase();
  if (source.startsWith("mcg")) return "mcg";
  if (source.startsWith("mg")) return "mg";
  if (source === "g" || source === "iu") return source;
  return "";
}

type DoseComparison =
  | { status: "comparable"; amount: number; unit: string }
  | { status: "unsupported"; doseUnit: string; ruleUnit: string }
  | { status: "not_recorded" };

const DOSAGE_FORM_UNITS = new Set(["capsule", "capsules", "tablet", "tablets", "softgel", "softgels", "drop", "drops", "scoop", "scoops", "serving", "servings"]);

function comparableDose(candidate: SafetyCandidate, rule: SafetyRuleRow): DoseComparison {
  const dose = parseDose(candidate.dose);
  const ruleUnit = comparableRuleUnit(rule.unit);
  if (!dose || !ruleUnit || DOSAGE_FORM_UNITS.has(dose.unit)) return { status: "not_recorded" };
  if (dose.unit === ruleUnit) return { status: "comparable", amount: dose.amount, unit: ruleUnit };

  const massInMcg: Record<string, number> = { mcg: 1, mg: 1_000, g: 1_000_000 };
  if (massInMcg[dose.unit] && massInMcg[ruleUnit]) {
    return { status: "comparable", amount: dose.amount * massInMcg[dose.unit] / massInMcg[ruleUnit], unit: ruleUnit };
  }

  const identity = healthItemIdentityKey(candidate.name);
  if (identity.startsWith("vitamin-d") && ((dose.unit === "iu" && ruleUnit === "mcg") || (dose.unit === "mcg" && ruleUnit === "iu"))) {
    return { status: "comparable", amount: dose.unit === "iu" ? dose.amount / 40 : dose.amount * 40, unit: ruleUnit };
  }
  return { status: "unsupported", doseUnit: dose.unit, ruleUnit };
}

function confidence(value?: string | null): SafetyEvidenceProvenance["confidence"] {
  return value === "high" || value === "moderate" || value === "low" ? value : "unknown";
}

function provenance(row?: SafetyProvenanceRow | null, fallbackUrl?: string | null): SafetyEvidenceProvenance {
  return {
    sourceLabel: row?.source_label ?? null,
    sourceUrl: row?.source_url ?? fallbackUrl ?? null,
    sourceType: row?.source_type ?? "legacy_unknown",
    sourceDate: row?.source_date ?? null,
    lastReviewedOn: row?.last_reviewed_on ?? null,
    exactIngredientForm: row?.exact_ingredient_form ?? null,
    mechanism: row?.interaction_mechanism ?? null,
    severityRationale: row?.severity_rationale ?? null,
    confidence: confidence(row?.confidence),
    qualification: row?.user_qualification ?? null,
    ruleVersion: row?.rule_version ?? "legacy-v1",
    provenanceStatus: row?.provenance_status === "reviewed" ? "reviewed" : "unreviewed",
  };
}

export function unknownSafetyEvidence(sourceUrl?: string | null): SafetyEvidenceProvenance {
  return provenance(null, sourceUrl);
}

function magnesiumDoseBasisIsExplicit(candidate: SafetyCandidate): boolean {
  const identity = healthItemIdentityKey(candidate.name);
  if (!identity.startsWith("magnesium-") || identity === "magnesium-unspecified") return true;
  const dose = String(candidate.dose ?? "");
  return /(?:\b\d+(?:\.\d+)?\s*(?:mcg|mg|g)\s+(?:of\s+)?elemental(?:\s+magnesium)?\b|\belemental(?:\s+magnesium)?\s*:?\s*\d+(?:\.\d+)?\s*(?:mcg|mg|g)\b)/i.test(dose);
}

function worstDecision(findings: SafetyFinding[]): SafetyDecision {
  return findings.some((finding) => finding.decision === "blocked")
    ? "blocked"
    : findings.length ? "review" : "clear";
}

function addFinding(target: SafetyFinding[], finding: SafetyFinding): void {
  const key = `${finding.code}:${normalize(finding.item)}:${normalize(finding.message)}`;
  if (!target.some((existing) => `${existing.code}:${normalize(existing.item)}:${normalize(existing.message)}` === key)) {
    target.push(finding);
  }
}

function finding(
  code: string,
  item: string,
  message: string,
  severity: SafetySeverity,
  source: SafetySource,
  sourceUrl?: string | null,
  evidenceRow?: SafetyProvenanceRow | null,
  decision?: Exclude<SafetyDecision, "clear">,
): SafetyFinding {
  const evidence = provenance(evidenceRow, sourceUrl);
  return {
    code,
    item,
    message,
    severity,
    decision: decision ?? (severity === "danger" ? "blocked" : "review"),
    source,
    sourceUrl: evidence.sourceUrl,
    evidence,
  };
}

export function evaluateSafetyCandidates(
  context: SafetyContext,
  candidates: SafetyCandidate[],
  sources: SafetySources
): SafetyEvaluation {
  const medications = stringList(context.medications);
  const conditions = stringList(context.conditions);
  const allergies = stringList(context.allergies);
  const procedures = stringList(context.procedures);
  const hasThyroidMedication = contextMatches(medications, THYROID_MED_RE);
  const hasAnticoagulant = contextMatches(medications, ANTICOAGULANT_RE);
  const hasGlucoseMedication = contextMatches(medications, GLUCOSE_MED_RE);
  const hasSedative = contextMatches(medications, SEDATIVE_RE);
  const hasAntibiotic = contextMatches(medications, ANTIBIOTIC_RE);
  const hasImmunosuppressant = contextMatches(medications, IMMUNOSUPPRESSANT_RE);
  const hasStimulant = contextMatches(medications, STIMULANT_RE);
  const hasSerotonergicMedication = contextMatches(medications, SSRI_SNRI_MAOI_RE);
  const hasKidneyCondition = contextMatches(conditions, /\b(?:kidney|renal|dialysis|neph)/i);
  const hasLiverCondition = contextMatches(conditions, /\b(?:liver|hepatic|cirrhosis|hepatitis)/i);
  const isImmunocompromised = contextMatches(conditions, /\b(?:immunocompromised|immune\s+suppression|transplant)/i);
  const hasUpcomingProcedure = contextMatches([...procedures, ...conditions], /\b(?:surgery|procedure|operation|colonoscopy|endoscopy|dental\s+extraction)\b/i);
  const unknownMedications = medications.filter((medication) => !RECOGNIZED_MED_RE.test(medication));

  const candidatesByIdentity = new Map<string, SafetyCandidate>();
  for (const candidate of candidates) {
    const key = healthItemIdentityKey(candidate.name);
    if (!key) continue;
    const existing = candidatesByIdentity.get(key);
    if (!existing || candidate.is_current === true) candidatesByIdentity.set(key, candidate);
  }
  const uniqueCandidates = Array.from(candidatesByIdentity.values());

  const candidateResults = uniqueCandidates.map((candidate): SafetyCandidateResult => {
    const findings: SafetyFinding[] = [];
    const match = mergedInteraction(candidate.name, sources.interactions);

    for (const allergy of allergies) {
      if (allergyMatchesCandidate(allergy, candidate.name)) {
        addFinding(findings, finding("allergy_match", candidate.name, `Reported allergy may match ${candidate.name}. Do not start or continue it until a clinician or pharmacist confirms the ingredient.`, "danger", "intake"));
      }
    }

    if (!match) {
      if (candidate.is_current !== true) {
        addFinding(findings, finding("interaction_record_missing", candidate.name, `No structured interaction record matched ${candidate.name}. A clinician or pharmacist should review it before a new start.`, "warning", "system"));
      }
    } else {
      if (hasThyroidMedication && match.binds_thyroid_meds) {
        const timing = match.sep_hours_thyroid
          ? `by at least ${match.sep_hours_thyroid} hours`
          : "using the interval on the prescription label or provided by a pharmacist";
        addFinding(findings, finding("thyroid_spacing", candidate.name, `Keep ${candidate.name} separated from thyroid medication ${timing}. Do not change the medication itself.`, "warning", "interactions", match.source_url, match));
      }
      if (hasAnticoagulant && match.anticoagulants_bleeding_risk) {
        addFinding(findings, finding("anticoagulant_bleeding", candidate.name, `${candidate.name} may change bleeding risk with the reported anticoagulant. Do not add or change it without coordinated review.`, "danger", "interactions", match.source_url, match));
      }
      if (hasUpcomingProcedure && match.anticoagulants_bleeding_risk) {
        addFinding(findings, finding("procedure_bleeding", candidate.name, `${candidate.name} may matter before the reported procedure. Confirm the plan with the procedure team before use.`, "danger", "interactions", match.source_url, match));
      }
      if (hasGlucoseMedication && match.diabetes_meds_additive) {
        addFinding(findings, finding("glucose_lowering", candidate.name, `${candidate.name} may add to glucose-lowering effects. Review monitoring and timing before use.`, "warning", "interactions", match.source_url, match));
      }
      if (hasSedative && match.sedatives_additive) {
        addFinding(findings, finding("sedating_additive", candidate.name, `${candidate.name} may add to drowsiness from a reported medication. Review timing and avoid driving if drowsy.`, "warning", "interactions", match.source_url, match));
      }
      if (hasAntibiotic && match.antibiotics_interaction) {
        addFinding(findings, finding("antibiotic_interaction", candidate.name, `${candidate.name} may interact with or need spacing from the reported antibiotic. Ask a pharmacist for exact timing.`, "warning", "interactions", match.source_url, match));
      }
      if (isPregnant(context.pregnant) && match.pregnancy_caution) {
        addFinding(findings, finding("pregnancy_caution", candidate.name, `${candidate.name} is flagged for pregnancy caution. Do not start it without obstetric clinician review.`, "danger", "interactions", match.source_url, match));
      }
      if (hasLiverCondition && (match.liver_disease_caution || match.liver_caution)) {
        addFinding(findings, finding("liver_caution", candidate.name, `${candidate.name} is flagged for caution with the reported liver context. Review it before use.`, "warning", "interactions", match.source_url, match));
      }
      if (hasKidneyCondition && (match.kidney_disease_caution || match.kidney_caution)) {
        addFinding(findings, finding("kidney_caution", candidate.name, `${candidate.name} is flagged for caution with the reported kidney context. Review dose and monitoring before use.`, "warning", "interactions", match.source_url, match));
      }
      if ((isImmunocompromised || hasImmunosuppressant) && match.immunocompromised_caution) {
        addFinding(findings, finding("immune_caution", candidate.name, `${candidate.name} is flagged for review with the reported immune context or medication.`, "warning", "interactions", match.source_url, match));
      }
      if (hasStimulant && match.caffeine_stimulant_caution) {
        addFinding(findings, finding("stimulant_additive", candidate.name, `${candidate.name} may add to stimulant effects. Review timing, sleep impact, heart rate, and blood pressure before use.`, "warning", "interactions", match.source_url, match));
      }
    }

    if (hasSerotonergicMedication && /^5\s*htp\b/i.test(normalize(candidate.name))) {
      addFinding(findings, finding("serotonergic_combination", candidate.name, `Do not combine ${candidate.name} with the reported serotonergic medication without clinician review.`, "danger", "rules"));
    }

    for (const rule of sources.rules) {
      const trigger = normalize(rule.trigger_name);
      const contextTrigger =
        (trigger === "thyroid med" && hasThyroidMedication) ||
        (trigger === "anticoagulant" && hasAnticoagulant) ||
        (trigger === "diabetes med" && hasGlucoseMedication) ||
        (trigger === "pregnancy" && isPregnant(context.pregnant)) ||
        (trigger === "liver impairment" && hasLiverCondition) ||
        (trigger === "kidney impairment" && hasKidneyCondition);
      const ruleText = `${rule.caution ?? ""} ${rule.message ?? ""}`.trim();
      if (contextTrigger && nameAppearsInText(candidate.name, ruleText) && !(trigger === "thyroid med" && match?.binds_thyroid_meds)) {
        const severity = String(rule.severity ?? "warning").toLowerCase() === "danger" ? "danger" : "warning";
        addFinding(findings, finding(`rule_${trigger.replace(/\s+/g, "_")}`, candidate.name, rule.caution || rule.message || "Clinician review is recommended.", severity, "rules", rule.source_url, rule));
      }

      if (String(rule.rule_type ?? "").toUpperCase() === "UL" && rule.entity_a_name && interactionMatches(candidate.name, [{ ingredient: rule.entity_a_name }]).length) {
        const dose = comparableDose(candidate, rule);
        const max = Number(rule.max_daily_amount);
        if (dose.status === "unsupported") {
          addFinding(findings, finding(
            "dose_unit_not_comparable",
            candidate.name,
            `The recorded dose uses ${dose.doseUnit}, while this safety threshold uses ${dose.ruleUnit}. LVE360 did not guess a conversion. Confirm the labeled amount and unit before relying on this comparison.`,
            "warning",
            "rules",
            rule.source_url,
            rule,
          ));
        }
        if (dose.status === "comparable" && Number.isFinite(max) && dose.amount > max) {
          if (!magnesiumDoseBasisIsExplicit(candidate)) {
            addFinding(findings, finding(
              "dose_basis_unclear",
              candidate.name,
              `The recorded ${candidate.dose} may describe the full compound rather than elemental magnesium. Check the Supplement Facts line for the elemental magnesium amount before comparing it with the supplemental upper limit.`,
              "warning",
              "rules",
              rule.source_url,
              rule,
            ));
          } else {
            const isCurrent = candidate.is_current === true;
            const clinicianDirected = ["clinician", "pharmacist"].includes(String(candidate.instruction_authority ?? "").toLowerCase());
            const currentMessage = `${candidate.name} is recorded above the structured adult upper-intake threshold. ${clinicianDirected ? "It is marked as clinician- or pharmacist-directed. " : ""}Confirm the total intake, reason, and monitoring plan with the qualified professional who oversees it. Do not change it from this app warning alone.`;
            const clinicianDirectedException = isCurrent && clinicianDirected;
            addFinding(findings, finding(
              "upper_limit",
              candidate.name,
              isCurrent ? currentMessage : rule.message || `${candidate.name} exceeds the structured adult upper limit. Review it before starting.`,
              clinicianDirectedException ? "warning" : "danger",
              "rules",
              rule.source_url,
              rule,
              clinicianDirectedException ? "review" : "blocked",
            ));
          }
        }
      }

      if (String(rule.rule_type ?? "").toUpperCase() === "SPACING" && !match?.binds_thyroid_meds && rule.entity_a_name && medications.some((medication) => normalize(medication).includes(normalize(rule.entity_a_name))) && nameAppearsInText(candidate.name, rule.message ?? "")) {
        addFinding(findings, finding("medication_spacing", candidate.name, rule.message || `Separate ${candidate.name} from the reported medication.`, "warning", "rules", rule.source_url, rule));
      }
    }

    if (unknownMedications.length && candidate.is_current !== true) {
      addFinding(findings, finding("unknown_medication", candidate.name, `The interaction library did not classify ${unknownMedications.join(", ")}. Proposed supplements require pharmacist or clinician review before use.`, "warning", "system"));
    }

    return {
      name: candidate.name,
      isCurrent: candidate.is_current === true,
      decision: worstDecision(findings),
      findings,
    };
  });

  const findings = candidateResults.flatMap((candidate) => candidate.findings);
  return {
    complete: true,
    status: worstDecision(findings),
    candidates: candidateResults,
    findings,
  };
}

export function unavailableSafetyEvaluation(candidates: SafetyCandidate[], reason = "Structured safety evaluation was unavailable."): SafetyEvaluation {
  const results = candidates.map((candidate): SafetyCandidateResult => {
    const systemFinding = finding("evaluation_unavailable", candidate.name, `${reason} Do not start a proposed supplement until a clinician or pharmacist reviews it.`, "warning", "system");
    return {
      name: candidate.name,
      isCurrent: candidate.is_current === true,
      decision: "review",
      findings: [systemFinding],
    };
  });
  return {
    complete: false,
    status: "review",
    candidates: results,
    findings: results.flatMap((candidate) => candidate.findings),
  };
}

export function safetySectionFromEvaluation(evaluation: SafetyEvaluation): string {
  const uniqueFindings: SafetyFinding[] = [];
  for (const item of evaluation.findings) addFinding(uniqueFindings, item);
  const findingsByItem = new Map<string, SafetyFinding[]>();
  for (const item of uniqueFindings) {
    const key = healthItemIdentityKey(item.item) || normalize(item.item);
    findingsByItem.set(key, [...(findingsByItem.get(key) ?? []), item]);
  }
  const bullets = findingsByItem.size
    ? Array.from(findingsByItem.values()).flatMap((items) => {
      const decision = worstDecision(items);
      const urgency = decision === "blocked" ? "Review before starting or making changes" : "Review, not an emergency";
      const name = canonicalHealthItemDisplayName(items[0].item);
      const messages = Array.from(new Set(items.map((item) => item.message.trim()))).join(" ");
      const evidence = items.find((item) => item.evidence?.provenanceStatus === "reviewed")?.evidence
        ?? items[0].evidence
        ?? unknownSafetyEvidence(items[0].sourceUrl);
      const source = evidence.sourceLabel
        ? evidence.sourceUrl ? `[${evidence.sourceLabel}](${evidence.sourceUrl})` : evidence.sourceLabel
        : evidence.provenanceStatus === "reviewed" ? "Reviewed LVE360 safety rule" : "Legacy rule; source details not yet curated";
      return [
        `- **Clinician review: ${name}:**`,
        `  - **Urgency:** ${urgency}.`,
        `  - **What to do:** ${messages}`,
        `  - **Why this appeared:** ${evidence.mechanism ?? evidence.severityRationale ?? "A structured safety rule matched the information currently saved."}`,
        `  - **Evidence:** ${source}. Confidence: ${evidence.confidence}. Rule version: ${evidence.ruleVersion}.`,
        ...(evidence.qualification ? [`  - **Important context:** ${evidence.qualification}`] : []),
      ];
    })
    : ["- **No material flags identified:** No specific interaction requiring action was identified from the reported information and structured rules. Recheck whenever medications, supplements, pregnancy status, conditions, or procedures change."];
  return [
    "## Contraindications & Med Interactions",
    "",
    ...bullets,
    "",
    "**Analysis**",
    "",
    evaluation.complete
      ? "This result is limited to the information provided and the structured rules available at generation time. Keep prescription and hormone instructions unchanged."
      : "The safety review did not complete. Keep prescription and hormone instructions unchanged, and do not start proposed supplements until the review is completed.",
  ].join("\n");
}

export function applySafetyEvaluationToMarkdown(markdown: string, evaluation: SafetyEvaluation): string {
  const decisions = new Map(evaluation.candidates.map((candidate) => [normalize(candidate.name), candidate]));
  const lines = markdown.split(/\r?\n/).map((line) => {
    if (!/^\s*\|\s*\d+\s*\|/.test(line)) return line;
    const cells = line.split("|");
    const candidate = decisions.get(normalize(cells[2]));
    if (!candidate || candidate.isCurrent || candidate.decision === "clear") return line;
    cells[3] = " Clinician review ";
    return cells.join("|");
  });
  const updated = lines.join("\n");
  const section = safetySectionFromEvaluation(evaluation);
  const sectionRe = /## Contraindications & Med Interactions[\s\S]*?(?=\n## |$)/i;
  return sectionRe.test(updated)
    ? updated.replace(sectionRe, section)
    : `${updated.trim()}\n\n${section}`;
}
