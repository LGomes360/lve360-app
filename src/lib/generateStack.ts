/* eslint-disable @typescript-eslint/consistent-type-imports */
/* eslint-disable no-console */
// ----------------------------------------------------------------------------
// LVE360 — generateStack.ts (RECONCILED, FULL-FEATURE)
// Purpose: Generate validated Markdown report in 3 passes, parse StackItems,
// run safety checks, enrich affiliate links, attach evidence, override
// Evidence & Shopping sections, and persist everything to Supabase.
// ----------------------------------------------------------------------------

import getSubmissionWithChildren from "@/lib/getSubmissionWithChildren";
import { supabaseAdmin } from "@/lib/supabase";
import parseMarkdownToItems from "@/lib/parseMarkdownToItems";
import { formatStartingGuidance } from "@/lib/supplementDosingRegistry";
import { AFFILIATE_DISCLOSURE_NEAR_LINKS } from "@/lib/reportDisclosures";
import { parseBlueprintReport, validateBlueprintReport } from "@/lib/blueprintReport";
import { applySafetyChecks } from "@/lib/safetyCheck";
import { enrichAffiliateLinks, buildAmazonSearchLink } from "@/lib/affiliateLinks";
import { getTopCitationsFor } from "@/lib/evidence";
import { callOpenAI } from "@/lib/openai";
import {
  buildNormalizedCurrentStackLedger,
  currentStackKindLabel,
  findMissingRepeatedTallyItems,
  isMalformedCurrentStackName,
  type NormalizedCurrentStackLedgerItem,
} from "@/lib/normalizedCurrentStackLedger";
import {
  isEligibleSupplementName,
  isMedicationOrHormoneName,
  isPreferenceFieldOrValue,
  preferenceValuesFound,
  RECOMMENDABLE_SUPPLEMENT_CANDIDATES,
} from "@/lib/supplementEligibility";

// Curated evidence index (JSON)
// If this path differs in your repo, update the import below.
// The code tolerates absence by falling back to model citations only.
// @ts-ignore: JSON module provided by build tooling
import evidenceIndex from "@/evidence/evidence_index_top3.json";

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------
export type ChatMsg = { role: "system" | "user" | "assistant"; content: string };

type GenerateMode = "free" | "premium";
export interface GenerateOptions {
  mode?: GenerateMode;       // default inferred from submission
  maxItems?: number;         // hard cap (e.g., 3 for free) — only when provided
  forceRegenerate?: boolean; // kept for parity / future use
}

export interface StackItem {
  name: string;
  dose?: string | null;
  dose_parsed?: { amount?: number; unit?: string };
  timing?: string | null;
  rationale?: string | null;
  notes?: string | null;
  caution?: string | null;
  citations?: string[] | null;
  is_current?: boolean; // true if listed in Current Stack
  timing_bucket?: "AM" | "PM" | "AM/PM" | "Anytime" | null;
  timing_text?: string | null;
  link_budget?: string | null;
  link_trusted?: string | null;
  link_clean?: string | null;
  link_default?: string | null;
  link_amazon?: string | null;
  link_fullscript?: string | null;
  link_thorne?: string | null;
  link_other?: string | null;
  cost_estimate?: number | null;
}

// Row shape we insert into public.stacks_items
interface StackItemRow {
  stack_id: string;
  user_id: string;
  user_email: string | null;
  name: string;
  dose: string | null;
  timing: string | null;
  notes: string | null;
  rationale: string | null;
  caution: string | null;
  citations: string | null;
  link_amazon: string | null;
  link_fullscript: string | null;
  link_thorne: string | null;
  link_other: string | null;
  cost_estimate: number | null;
  is_current: boolean | null;
  timing_bucket: string | null;
  timing_text: string | null;
}

interface EvidenceEntry { url?: string | null; [key: string]: any }

type EvidenceIndex = Record<string, EvidenceEntry[]>;
const EVIDENCE: EvidenceIndex = (evidenceIndex as unknown) as EvidenceIndex;
const LLM_DEFAULT_TIMEOUT_MS = 90_000; // 90s default for all LLM calls
const LLM_TIMEOUT_MS = 95_000; // 95s to prevent Pass B timeouts seen in logs
const wait = (ms:number)=>new Promise(res=>setTimeout(res, ms));

// ----------------------------------------------------------------------------
// Model resolution + safe caller
// ----------------------------------------------------------------------------
const MODEL_ALIASES: Record<string, string> = {
  // requested → actual
  "gpt-5-mini": "gpt-4o-mini",
  "gpt-5": "gpt-4o",
  // alternates
  "o4-mini": "gpt-4o-mini",
  "o4": "gpt-4o",
};

const ENV_MINI = process.env.OPENAI_MINI_MODEL?.trim();
const ENV_MAIN = process.env.OPENAI_MAIN_MODEL?.trim();

function normalizeModel(requested: "mini" | "main" | string): string {
  if (requested === "mini") return ENV_MINI || "gpt-4o-mini";
  if (requested === "main") return ENV_MAIN || "gpt-4o";
  return MODEL_ALIASES[requested] || requested;
}

function candidateModels(kind: "mini" | "main", fallbackRequested?: string): string[] {
  const primary = normalizeModel(kind);
  const byAlias = fallbackRequested ? MODEL_ALIASES[fallbackRequested] || fallbackRequested : undefined;
  const tail = kind === "mini" ? ["gpt-4o-mini", "gpt-4o"] : ["gpt-4o", "gpt-4o-mini"];
  return Array.from(new Set([primary, byAlias, ...tail].filter(Boolean))) as string[];
}

type AnyCaller = (model: string, input: any, options?: any) => Promise<any>;

// Accept messages[] or joined string, and rotate candidates on 400/404/timeouts
async function callChatWithRetry(
  requestedModelKind: "mini" | "main",
  msgs: ChatMsg[],
  opts?: { maxTokens?: number; timeoutMs?: number }
): Promise<any> {
  const fn = callOpenAI as unknown as (model: string, input: any, options?: any) => Promise<any>;
  const models = candidateModels(requestedModelKind);
  let lastErr: any = null;
  for (const model of models) {
    try {
      try {
        return await fn(model, msgs, { maxTokens: opts?.maxTokens ?? 1200, timeoutMs: opts?.timeoutMs ?? LLM_DEFAULT_TIMEOUT_MS });
      } catch {
        const joined = msgs.map(m => `[${m.role.toUpperCase()}]\n${m.content}`).join("\n\n");
        return await fn(model, joined, { maxTokens: opts?.maxTokens ?? 1200, timeoutMs: opts?.timeoutMs ?? LLM_DEFAULT_TIMEOUT_MS });
      }
    } catch (e: any) {
      lastErr = e;
      const msg = String(e?.message || e);
      const code = (e?.status ?? e?.code ?? "").toString();
      if (!/invalid model|model_not_found|400|404|timeout|ETIMEDOUT/i.test(msg) && code !== "400" && code !== "404") break;
      console.warn(`[llm.retry] ${model} failed: ${msg}`);
    }
  }
  throw lastErr || new Error("All model candidates failed");
}


// ----------------------------------------------------------------------------
// Config & Constants
// ----------------------------------------------------------------------------
const TODAY = new Date().toISOString().slice(0, 10); // e.g., 2025-11-03
const MIN_ANALYSIS_SENTENCES = 3;
const BLUEPRINT_MIN_ROWS = 10; // business rule: always show ≥10 rows

const MODEL_CITE_RE = /\bhttps?:\/\/(?:pubmed\.ncbi\.nlm\.nih\.gov\/\d+\/?|doi\.org\/\S+)\b/;
const CURATED_CITE_RE = /\bhttps?:\/\/(?:pubmed\.ncbi\.nlm\.nih\.gov\/\d+\/?|pmc\.ncbi\.nlm\.nih\.gov\/articles\/\S+|doi\.org\/\S+|jamanetwork\.com\/\S+|biomedcentral\.com\/\S+|bmcpsychiatry\.biomedcentral\.com\/\S+|journals\.plos\.org\/\S+|nature\.com\/\S+|sciencedirect\.com\/\S+|amjmed\.com\/\S+|koreascience\.kr\/\S+|researchmgt\.monash\.edu\/\S+)\b/i;

const HEADINGS = [
  "## Intro Summary",
  "## Goals",
  "## Contraindications & Med Interactions",
  "## Current Stack",
  "## Your Blueprint Recommendations",
  "## Dosing & Notes",
  "## Evidence & References",
  "## Shopping Links",
  "## Follow-up Plan",
  "## Lifestyle Prescriptions",
  "## Longevity Levers",
  "## This Week Try",
  "## END",
];

// ----------------------------------------------------------------------------
// Utility helpers
// ----------------------------------------------------------------------------
const wc = (t: string) => (t || "").trim().split(/\s+/).filter(Boolean).length;
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const asArray = <T>(v: T[] | null | undefined): T[] => (Array.isArray(v) ? v : []);

function cleanName(raw: string): string {
  if (!raw) return "";
  return raw.replace(/[*_`#]/g, "").replace(/\s+/g, " ").trim();
}

function age(dob: string | null) {
  if (!dob) return null;
  const d = new Date(dob);
  const t = new Date(TODAY);
  let a = t.getFullYear() - d.getFullYear();
  if (t < new Date(t.getFullYear(), d.getMonth(), d.getDate())) a--;
  return a;
}

function extractUserId(sub: any): string | null {
  return sub?.user_id ?? (typeof sub.user === "object" ? sub.user?.id : null) ?? null;
}

function normalizeUnit(u?: string | null) {
  const s = (u ?? "").toLowerCase();
  if (s === "μg" || s === "mcg" || s === "ug") return "mcg";
  if (s === "iu") return "IU";
  if (s === "mg" || s === "g") return s;
  return s || null;
}

function parseDose(dose?: string | null): { amount?: number; unit?: string } {
  if (!dose) return {};
  const cleaned = dose.replace(/[,]/g, " ").replace(/\s+/g, " ");
  const matches = cleaned.match(/(\d+(?:\.\d+)?)/g);
  if (!matches) return {};
  const amount = parseFloat(matches[matches.length - 1]);
  const unitMatch = cleaned.match(/(mcg|μg|ug|mg|g|iu)\b/i);
  const rawUnit = unitMatch ? unitMatch[1] : "";
  let unit = normalizeUnit(rawUnit);
  let val = amount;
  if (unit === "g") { val = amount * 1000; unit = "mg"; }
  return { amount: val, unit: unit ?? undefined };
}

function normalizeTiming(raw?: string | null): string | null {
  if (!raw) return null;
  const s = raw.toLowerCase();
  if (/\bam\b|morning/.test(s)) return "AM";
  if (/\bpm\b|evening|night/.test(s)) return "PM";
  if (/am\/pm|both|split|\bbid\b/.test(s)) return "AM/PM";
  if (/with (meals?|food)/.test(s)) return "Anytime";
  return raw.trim();
}

function classifyTimingBucket(text?: string | null): "AM" | "PM" | "AM/PM" | "Anytime" | null {
  if (!text) return null;
  const s = text.toLowerCase();
  const am = /\b(am|morning|breakfast)\b/.test(s);
  const pm = /\b(pm|evening|night|bedtime)\b/.test(s);
  const bothWords = /\b(bid|twice|2x|am\/pm|split)\b/.test(s);
  const meals = /\b(with (meals?|food))\b/.test(s);
  if (am && pm) return "AM/PM";
  if (bothWords) return "AM/PM";
  if (am) return "AM";
  if (pm) return "PM";
  if (meals) return "Anytime";
  return null;
}

function escapeRe(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

function sectionChunk(md: string, header: string) {
  const re = new RegExp(`${escapeRe(header)}([\\s\\S]*?)(?=\\n## |\\n## END|$)`, "i");
  const m = (md || "").match(re);
  return m ? m[1] : "";
}

const CANONICAL_REPORT_HEADINGS = HEADINGS.slice(0, -1);
const PLACEHOLDER_SECTION_RE = /\b(?:tbd|placeholder|content pending|evidence pending|will populate|to be completed|this section will be auto-completed)\b/i;
const INVALID_ITEM_NAME_RE = /^(?:see\s+(?:dosing(?:\s*&\s*notes)?|notes)|tbd|none|null|n\/?a|blank)$/i;
const DEFAULT_BLUEPRINT_ITEMS = RECOMMENDABLE_SUPPLEMENT_CANDIDATES;
const OBJECT_STRING_RE = /^\[object Object\]$/i;
type NormalizationStats = { rejectedObjectValues: number };

function readableNameText(raw: string): string | null {
  const name = cleanName(raw);
  return name && !OBJECT_STRING_RE.test(name) && !INVALID_ITEM_NAME_RE.test(name) ? name : null;
}

export function extractReadableNames(
  value: unknown,
  stats?: NormalizationStats,
  seen: WeakSet<object> = new WeakSet(),
  depth = 0
): string[] {
  if (value == null || depth > 10) return [];
  if (typeof value === "string") {
    return value.split(/,|\n|;|\|/).map(readableNameText).filter((name): name is string => Boolean(name));
  }
  if (typeof value !== "object") return [];
  if (seen.has(value as object)) return [];
  seen.add(value as object);
  if (Array.isArray(value)) {
    return value.flatMap((item) => extractReadableNames(item, stats, seen, depth + 1));
  }

  const object = value as Record<string, any>;
  const candidates = [
    object.med_name, object.supplement_name, object.hormone_name,
    object.name, object.label, object.text, object.title,
    object.selectedOptions, object.choices?.labels,
    object.value, object.answer, object.choice,
  ].filter((candidate) => candidate != null);
  let names = candidates.flatMap((candidate) => extractReadableNames(candidate, stats, seen, depth + 1));
  if (!names.length) {
    const ignored = new Set(["id", "key", "type", "options", "dose", "dosage", "timing", "frequency", "purpose", "notes"]);
    names = Object.entries(object)
      .filter(([key]) => !ignored.has(key))
      .flatMap(([, nested]) => extractReadableNames(nested, stats, seen, depth + 1));
  }
  if (!names.length) stats && (stats.rejectedObjectValues += 1);
  return Array.from(new Set(names));
}

function validItemName(raw: unknown): string | null {
  if (typeof raw === "object" && raw !== null) return extractReadableNames(raw)[0] ?? null;
  return readableNameText(String(raw ?? ""));
}

function intakeItems(raw: any): any[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "object") return [raw];
  return extractReadableNames(raw);
}

function readableDetail(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string" || typeof value === "number") {
    const text = cleanName(String(value));
    return text && !OBJECT_STRING_RE.test(text) ? text : null;
  }
  return extractReadableNames(value)[0] ?? null;
}

function normalizedItemWithDetails(item: unknown, name: string): string | Record<string, string> {
  if (!item || typeof item !== "object" || Array.isArray(item)) return name;
  const source = item as Record<string, unknown>;
  const purpose = readableDetail(source.purpose ?? source.notes);
  const dose = readableDetail(source.dose ?? source.dosage ?? source.amount);
  const timing = readableDetail(source.timing ?? source.frequency ?? source.schedule);
  return purpose || dose || timing
    ? { name, ...(purpose ? { purpose } : {}), ...(dose ? { dose } : {}), ...(timing ? { timing } : {}) }
    : name;
}

function buildCurrentStackSection(ledger: NormalizedCurrentStackLedgerItem[]): string {
  const body = ledger.length
    ? `| Current Item | Type | Purpose | Dosage | Timing |\n| --- | --- | --- | --- | --- |\n${ledger.map((item) => `| ${item.name} | ${currentStackKindLabel(item.kind)} | ${item.purpose ?? "Not provided"} | ${item.dose ?? "Not provided"} | ${item.timing ?? "Not provided"} |`).join("\n")}`
    : "No current medications, supplements, or hormones were reported in the intake.";
  return `## Current Stack\n\n${body}\n\n**Analysis**\n\nConfirm these entries match your intake. Prescribed medication and hormone instructions are shown for context and are not changed by this report.`;
}

const FORBIDDEN_COMPLIANCE_RE = /\b(?:therapeutically|therapeutic|alleviate symptoms?|safe|no significant interactions?)\b/i;

function complianceSafeLanguage(text: string): string {
  return text
    .replace(/\btherapeutically\b/gi, "for wellness support")
    .replace(/\btherapeutic\b/gi, "wellness")
    .replace(/\balleviat(?:e|es|ed|ing)\s+symptoms?\b/gi, "support day-to-day well-being")
    .replace(/\bsafe to use\b/gi, "appropriate to consider only after clinician review")
    .replace(/\bsafe\b/gi, "appropriate")
    .replace(/\bno significant interactions?\b/gi, "No specific interaction was flagged by this report")
    .replace(/\bno specific conflicts? (?:were )?detected(?: from your intake)?\b/gi, "No specific interaction was flagged by this report")
    .replace(/\bcaloric restriction\b/gi, "a sustainable calorie pattern")
    .replace(/\bintermittent fasting\b/gi, "consistent meal timing that supports adequate nutrition");
}

function ensureContraCurrentStackCoverage(
  passB: string,
  ledger: NormalizedCurrentStackLedgerItem[],
  berberineRequiresReview = false
): string {
  const header = "## Contraindications & Med Interactions";
  const body = sectionChunk(passB, header);
  if (!body || !ledger.length) return complianceSafeLanguage(passB);
  const beforeAnalysis = body.split(/^\*\*Analysis\*\*/im)[0] ?? "";
  const sourceBullets = beforeAnalysis.split(/\r?\n/).filter((line) => /^\s*[-*]\s+/.test(line));
  const sedationContext = /\b(?:lunesta|eszopiclone|xanax|zanax|alprazolam|melatonin|glycine)\b/i;
  const materialBullets = sourceBullets.filter((line) => {
    if (/no specific interaction|no significant interaction|no specific conflict/i.test(line)) return false;
    if (sedationContext.test(line)) return false;
    return /interaction|caution|monitor|spacing|separat|avoid|risk|drows|sedat|bleed|glucose|blood sugar|thyroid|kidney|liver|anticoagul|procedure/i.test(line);
  }).map((line) => complianceSafeLanguage(line
    .replace(/review with a qualified clinician or pharmacist before changing use\.?/gi, "")
    .replace(/\s+([.,])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim()));
  const bullets: string[] = Array.from(new Set(materialBullets));
  const sedatingItems = ledger.filter((item) => sedationContext.test(item.name)).map((item) => item.name);
  if (sedatingItems.length >= 2) {
    bullets.unshift(`- **Monitor — Sedating routine:** ${sedatingItems.join(", ")} may have additive drowsiness. Avoid driving if drowsy and keep prescribed instructions unchanged.`);
  }
  const thyroidItem = ledger.find((item) => /\b(?:armour thyroid|levothyroxine|synthroid|thyroid)\b/i.test(item.name));
  const spacingItems = ledger.filter((item) => /\b(?:magnesium|psyllium|fiber|calcium|iron)\b/i.test(item.name)).map((item) => item.name);
  if (thyroidItem && spacingItems.length) {
    bullets.push(`- **Monitor — Thyroid medication spacing:** Keep ${spacingItems.join(", ")} separated from ${thyroidItem.name} according to its prescription or label instructions; ask a pharmacist if the timing is unclear.`);
  }
  if (berberineRequiresReview && ledger.some((item) => /^berberine(?:\s+hcl)?$/i.test(item.name))) {
    bullets.push("- **Clinician review — Berberine:** Glucose-lowering medication or blood-sugar context was reported. Do not add or change Berberine without coordinated review.");
  }
  if (!bullets.length) {
    bullets.push("- **No material flags identified:** No specific interaction requiring action was identified from the reported stack. Recheck safety whenever medications or supplements change.");
  }
  const analysis = "Only material cautions are highlighted here. Keep prescription instructions unchanged and recheck this section whenever your stack changes.";
  const repaired = `${header}\n\n${bullets.join("\n")}\n\n**Analysis**\n\n${analysis}`;
  return complianceSafeLanguage(passB.replace(`${header}${body}`, repaired));
}

function validateCurrentStackParity(md: string, ledger: NormalizedCurrentStackLedgerItem[]) {
  const currentBody = sectionChunk(md, "## Current Stack").toLowerCase();
  const currentMissing = ledger.filter((item) => !currentBody.includes(item.name.toLowerCase()));
  const mismatch = Array.from(new Set(currentMissing.map((item) => item.name)));
  return { valid: mismatch.length === 0, mismatch };
}

function sectionBodyMeaningful(md: string, heading: string): boolean {
  const body = sectionChunk(md, heading).trim();
  if (!body || PLACEHOLDER_SECTION_RE.test(body)) return false;
  const meaningful = body
    .replace(/^\*\*Analysis\*\*\s*$/gim, "")
    .replace(/^\s*\|?(?:\s*:?-+:?\s*\|)+\s*$/gm, "")
    .replace(/[*_`#|\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return meaningful.length >= 12;
}

function emptyRequiredSections(md: string): string[] {
  return CANONICAL_REPORT_HEADINGS.filter((heading) => !sectionBodyMeaningful(md, heading));
}

function replaceOrAppendSection(md: string, block: string): string {
  const heading = block.match(/^## .+$/m)?.[0];
  if (!heading) return md;
  const re = new RegExp(`${escapeRe(heading)}[\\s\\S]*?(?=\\n## |$)`, "i");
  return re.test(md) ? md.replace(re, block.trim()) : `${md.trim()}\n\n${block.trim()}`;
}

function blueprintNames(blueprintTable: string): string[] {
  return Array.from(blueprintTable.matchAll(/\|\s*\d+\s*\|\s*([^|]+)\|/g))
    .map((match) => validItemName(match[1]))
    .filter((name): name is string => Boolean(name));
}

function sanitizeBlueprintTable(
  blueprintTable: string,
  minRows = BLUEPRINT_MIN_ROWS,
  allowedNames: string[] = DEFAULT_BLUEPRINT_ITEMS,
  currentLedger: NormalizedCurrentStackLedgerItem[] = [],
  berberineRequiresReview = false
): string {
  const rows = blueprintTable.split(/\r?\n/).filter((line) => /^\s*\|\s*\d+\s*\|/.test(line));
  const allowed = new Set(allowedNames.map((name) => name.toLowerCase()));
  const currentSupplements = new Set(currentLedger
    .filter((item) => item.kind === "supplement")
    .map((item) => normalizeSupplementName(item.name).toLowerCase()));
  const parsedItems = rows.flatMap((row) => {
    const cells = row.split("|").slice(1, -1).map((cell) => cell.trim());
    const name = validItemName(cells[1]);
    if (!name || isMalformedCurrentStackName(name) || !isEligibleSupplementName(name) || !allowed.has(name.toLowerCase())) return [];
    const whyCell = cells.length >= 4 ? cells[3] : cells[2];
    return [{ name, why: cleanName(whyCell || "") || "Selected to complement the reported goals and current routine", explicit: true }];
  });
  const candidates = parsedItems.filter((item) =>
    !(berberineRequiresReview && /^berberine(?:\s+hcl)?$/i.test(item.name))
  );
  for (const name of DEFAULT_BLUEPRINT_ITEMS) {
    if (!allowed.has(name.toLowerCase())) continue;
    if (berberineRequiresReview && /^berberine(?:\s+hcl)?$/i.test(name)) continue;
    candidates.push({ name, why: "Selected to complement the reported goals and current routine", explicit: false });
  }
  const candidateNames = new Set<string>();
  const deduped = candidates.filter((item) => {
    const key = normalizeSupplementName(item.name).toLowerCase();
    if (candidateNames.has(key)) return false;
    candidateNames.add(key);
    return true;
  });
  const classified = deduped.map((item) => ({
    ...item,
    status: currentSupplements.has(normalizeSupplementName(item.name).toLowerCase())
        ? "Current - optimize" as const
        : "New - consider" as const,
  }));
  const currentPool = classified.filter((item) => item.status === "Current - optimize").slice(0, 5);
  const clinicianPool: typeof classified = [];
  const newPool = classified.filter((item) => item.status === "New - consider");
  const selected = [...currentPool];
  const reservedClinician = clinicianPool.length;
  const requiredNew = Math.max(4, minRows - selected.length - reservedClinician);
  selected.push(...newPool.slice(0, requiredNew));
  selected.push(...clinicianPool);
  if (selected.length < minRows) {
    const selectedNames = new Set(selected.map((item) => normalizeSupplementName(item.name).toLowerCase()));
    selected.push(...newPool.filter((item) => !selectedNames.has(normalizeSupplementName(item.name).toLowerCase())).slice(0, minRows - selected.length));
  }
  const items = selected.slice(0, minRows);
  const header = "| Rank | Supplement | Status | Why it Matters |\n| --- | --- | --- | --- |";
  return `${header}\n${items.map((item, index) => {
    const status = item.status;
    const why = item.why;
    return `| ${index + 1} | ${item.name} | ${status} | ${complianceSafeLanguage(why)} |`;
  }).join("\n")}`;
}

function alignedDosingBody(blueprintTable: string, passB: string): string {
  const body = sectionChunk(passB, "## Dosing & Notes").trim();
  const lowerBody = body.toLowerCase();
  const missing = blueprintNames(blueprintTable).filter(
    (name) => !lowerBody.includes(name.toLowerCase())
  );
  if (!missing.length) return body;

  const coverage = missing
    .map(
      (name) =>
        `- **${name}** — Clinician review is recommended before use; a specific dose or timing is not provided.`
    )
    .join("\n");
  const analysisIndex = body.search(/^\*\*Analysis\*\*/im);
  if (analysisIndex >= 0) {
    return `${body.slice(0, analysisIndex).trim()}\n${coverage}\n\n${body.slice(analysisIndex).trim()}`;
  }
  return `${body}\n${coverage}\n\n**Analysis**\n\nThese notes cover every Blueprint recommendation. Specific dosing should be reviewed with a clinician when it cannot be provided safely from the intake alone.`.trim();
}

function consistentDosingBody(
  blueprintTable: string,
  passB: string,
  ledger: NormalizedCurrentStackLedgerItem[],
  berberineRequiresReview = false
): string {
  const body = sectionChunk(passB, "## Dosing & Notes").trim();
  const blueprint = blueprintNames(blueprintTable);
  const blueprintSet = new Set(blueprint.map((name) => normalizeSupplementName(name).toLowerCase()));
  const currentNames = ledger.map((item) => item.name);
  const currentSet = new Set(currentNames.map((name) => normalizeSupplementName(name).toLowerCase()));
  const bulletName = (line: string) => validItemName(
    line.match(/^\s*[-*]\s+(?:\*\*)?(.+?)(?:\*\*)?\s*(?::|-|—)\s+/)?.[1]
  );
  const bullets = body.split(/\r?\n/).filter((line) => /^\s*[-*]\s+/.test(line));
  const modelBlueprintLines = bullets.filter((line) => {
    const name = bulletName(line);
    return Boolean(name && blueprintSet.has(normalizeSupplementName(name).toLowerCase()));
  });
  const currentLines = bullets.filter((line) => {
    const name = bulletName(line);
    return Boolean(name && !isMalformedCurrentStackName(name) && !blueprintSet.has(normalizeSupplementName(name).toLowerCase()) && currentSet.has(normalizeSupplementName(name).toLowerCase()));
  });
  const uniqueCurrentLines = Array.from(new Map(currentLines.flatMap((line) => {
    const name = bulletName(line);
    return name ? [[normalizeSupplementName(name).toLowerCase(), line] as const] : [];
  })).values());
  const covered = new Set(
    modelBlueprintLines.map((line) => bulletName(line)?.toLowerCase()).filter((name): name is string => Boolean(name))
  );
  const missingLines = blueprint
    .filter((name) => !covered.has(name.toLowerCase()))
    .map((name) => `- **${name}** — Clinician review is recommended before use; a specific dose or timing is not provided.`);
  const modelLineByName = new Map([...modelBlueprintLines, ...missingLines]
    .map((line) => [bulletName(line)?.toLowerCase(), line] as const)
    .filter((entry): entry is readonly [string, string] => Boolean(entry[0])));
  const blueprintLines = blueprint.map((name) => {
    const current = ledger.find((item) => item.kind === "supplement" &&
      normalizeSupplementName(item.name).toLowerCase() === normalizeSupplementName(name).toLowerCase());
    const reported = [current?.dose, current?.timing].filter(Boolean).join(", ");
    if (current && reported) return `- **${name}** -- Your reported routine: ${reported}.`;
    if (berberineRequiresReview && /^berberine(?:\s+hcl)?$/i.test(name)) {
      return `- **${name}** -- Not included as a starting recommendation because glucose-lowering medication or blood-sugar context was reported.`;
    }
    const startingGuidance = formatStartingGuidance(name);
    if (startingGuidance) return `- **${name}** -- ${startingGuidance}`;
    return modelLineByName.get(name.toLowerCase()) ??
      `- **${name}** -- Clinician review is recommended before use; a specific dose or timing is not provided.`;
  }).map(complianceSafeLanguage);
  const coveredCurrent = new Set(
    uniqueCurrentLines.map((line) => {
      const name = bulletName(line);
      return name ? normalizeSupplementName(name).toLowerCase() : null;
    }).filter((name): name is string => Boolean(name))
  );
  const missingCurrentLines = ledger
    .filter((item) => !blueprintSet.has(normalizeSupplementName(item.name).toLowerCase()) && !coveredCurrent.has(normalizeSupplementName(item.name).toLowerCase()))
    .map((item) => {
      const details = [item.dose ? `dose: ${item.dose}` : null, item.timing ? `timing: ${item.timing}` : null].filter(Boolean).join("; ");
      const instruction = item.kind === "supplement"
        ? "Shown for context; no change is suggested by this report."
        : "Keep the prescribed instructions unchanged.";
      return `- **${item.name}** -- Current ${currentStackKindLabel(item.kind).toLowerCase()} reported${details ? ` (${details})` : ""}. ${instruction}`;
    });
  const currentNotes = [...uniqueCurrentLines, ...missingCurrentLines];
  const currentBlock = currentNotes.length
    ? `\n\n### Current Stack Notes\n\n${currentNotes.join("\n")}`
    : "";
  const sectionGuidance = "Starting points below are general educational guidance for eligible supplements. Keep prescribed medication and hormone instructions exactly as directed by the prescriber, and introduce only one new supplement at a time.";
  const analysis = "**Analysis**\n\nUse the lowest practical starting point, track how you respond, and change only one variable at a time. Item-specific cautions and spacing instructions take priority over general timing guidance.";
  return complianceSafeLanguage(`${sectionGuidance}\n\n${blueprintLines.join("\n")}${currentBlock}\n\n${analysis}`.trim());
}

function assembleCanonicalReport(
  restMd: string,
  blueprintTable: string,
  passB: string,
  ledger: NormalizedCurrentStackLedgerItem[],
  berberineRequiresReview = false
): string {
  const sources: Record<string, string> = {
    "## Contraindications & Med Interactions": passB,
    "## Your Blueprint Recommendations": `## Your Blueprint Recommendations\n\n${blueprintTable}`,
    "## Dosing & Notes": `## Dosing & Notes\n\n${consistentDosingBody(blueprintTable, passB, ledger, berberineRequiresReview)}`,
  };

  return CANONICAL_REPORT_HEADINGS.map((heading) => {
    if (heading === "## Your Blueprint Recommendations" || heading === "## Dosing & Notes") {
      return sources[heading];
    }
    const body = sectionChunk(sources[heading] || restMd, heading).trim();
    return `${heading}\n\n${body}`.trim();
  })
    .join("\n\n")
    .replace(/(^|\n)##\s*END\s*(?=\n|$)/gi, "$1")
    .trim();
}

function ensureReportDosingAlignment(md: string, ledger: NormalizedCurrentStackLedgerItem[], berberineRequiresReview = false): string {
  const blueprint = sectionChunk(md, "## Your Blueprint Recommendations");
  const dosing = consistentDosingBody(blueprint, md, ledger, berberineRequiresReview);
  return md.replace(
    /## Dosing & Notes[\s\S]*?(?=\n## |$)/i,
    `## Dosing & Notes\n\n${dosing}`
  );
}

function padBlueprint(md: string, minRows: number) {
  const re = /## Your Blueprint Recommendations([\s\S]*?)(?=\n## |\n## END|$)/i;
  const m = md.match(re);
  const header = `| Rank | Supplement | Why it Matters |\n| --- | --- | --- |\n`;
  if (!m) {
    const block =
      `## Your Blueprint Recommendations\n\n` +
      header +
      Array.from({ length: minRows })
        .map((_, i) => `| ${i + 1} | TBD | See Dosing & Notes |`)
        .join("\n") +
      `\n**Analysis**\n\nThese placeholders will be replaced on the next run.\n`;
    return md.replace(/\n## END/i, `\n\n${block}\n\n## END`);
  }
  const body = m[1];
  const lines = body.split("\n").filter((l) => l.trim().startsWith("|"));
  const isSeparator = (l: string) => /^\|\s*-+\s*\|/.test(l);
  const sepIdx = lines.findIndex(isSeparator);
  const dataStart = sepIdx >= 0 ? sepIdx + 1 : 1;
  const data = lines.slice(dataStart).filter((l) => /\S/.test(l));
  const need = Math.max(0, minRows - data.length);
  if (need <= 0) return md;
  const pad = Array.from({ length: need })
    .map((_, i) => `| ${data.length + i + 1} | TBD | See Dosing & Notes |`)
    .join("\n");
  const patched = body.includes("| --- |")
    ? body.replace(/\n(?!(.|\n))*$/, "") + `\n${pad}\n`
    : `\n${header}${data.join("\n")}\n${pad}\n`;
return md.replace(re, `## Your Blueprint Recommendations\n${patched}`);
}

function headingsOK(md: string) {
  return HEADINGS.slice(0, -1).every((h) => (md || "").includes(h));
}

function blueprintOK(md: string, minRows: number) {
  const body = sectionChunk(md, "## Your Blueprint Recommendations");
  if (!body) return false;
  const tableLines = body.split("\n").filter((l) => l.trim().startsWith("|"));
  if (tableLines.length < 2) return false;
  const isSeparator = (l: string) => /^\|\s*-+\s*\|/.test(l);
  const sepIdx = tableLines.findIndex(isSeparator);
  const dataStart = sepIdx >= 0 ? sepIdx + 1 : 1;
  const data = tableLines.slice(dataStart).filter((l) => /\S/.test(l));
  return data.length >= minRows;
}

function validateBlueprintMix(md: string) {
  const rows = sectionChunk(md, "## Your Blueprint Recommendations")
    .split(/\r?\n/)
    .filter((line) => /^\s*\|\s*\d+\s*\|/.test(line))
    .map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim()));
  const statuses = rows.map((cells) => cells[2]);
  const counts = {
    total: rows.length,
    current: statuses.filter((status) => status === "Current - optimize").length,
    new: statuses.filter((status) => status === "New - consider").length,
    clinicianReview: statuses.filter((status) => status === "Clinician review").length,
  };
  return {
    valid: counts.total === 10 && counts.current <= 5 && counts.new >= 4 && counts.clinicianReview <= 1 &&
      statuses.every((status) => ["Current - optimize", "New - consider", "Clinician review"].includes(status)),
    counts,
  };
}

function malformedCurrentStackRows(md: string): string[] {
  return sectionChunk(md, "## Current Stack")
    .split(/\r?\n/)
    .filter((line) => /^\s*\|/.test(line) && !/^\s*\|\s*(?:Current Item|-+)/i.test(line))
    .map((line) => line.split("|")[1]?.trim() ?? "")
    .filter(isMalformedCurrentStackName);
}

function citationsOK(md: string) {
  const body = sectionChunk(md, "## Evidence & References");
  if (!body) return false;
  const urls = Array.from(body.matchAll(/\((https?:\/\/[^\s)]+)\)/g)).map((m) => m[1]);
  const valid = urls.filter((u) => CURATED_CITE_RE.test(u) || MODEL_CITE_RE.test(u));
  return valid.length >= 8;
}

function narrativesOK(md: string, minSent: number) {
  const sections = (md || "").split("\n## ").slice(1);
  return sections.every((sec) => {
    const name = sec.split("\n", 1)[0] || "";
    const lines = sec.split("\n");
    const textBlock = lines.filter((l) => !l.startsWith("|") && !l.trim().startsWith("-"))
      .join(" ");
    const sentences = textBlock.split(/[.!?](?:\s|$)/).map((s) => s.trim()).filter(Boolean);
    if (/^Intro Summary/i.test(name)) return sentences.length >= 2;
    return sentences.length >= minSent;
  });
}

const END_RE = /(^|\n)(?:##\s*)?END\s*$/m;
function hasEnd(md: string) { return END_RE.test(md || ""); }
function ensureEnd(md: string) {
  const s = (md || "").trimEnd();
  return hasEnd(s) ? s : s + "\n\n## END\n";
}

function forceHeadings(md: string): string {
  let out = md || "";
  for (const h of HEADINGS.slice(0, -1)) {
    if (!out.includes(h)) {
      const block = `\n\n${h}\n\n**Analysis**\n\nThis section will be auto-completed based on your intake.`;
      out = /\n##\s*END\s*$/i.test(out) ? out.replace(/\n##\s*END\s*$/i, `${block}\n\n## END`) : out + block;
    }
  }
  return out;
}

function computeValidationTargets(_mode: GenerateMode, _cap?: number) {
  return { minWords: 700, minRows: BLUEPRINT_MIN_ROWS, minSent: MIN_ANALYSIS_SENTENCES };
}
function stripCodeFences(s: string): string {
  if (!s) return "";
  // remove ```lang\n...\n``` blocks while preserving the inner text
  return s
    .replace(/```[\s\S]*?```/g, (m) =>
      m.replace(/^```[\w-]*\n?/, "").replace(/```$/, "")
    )
    .trim();
}

function hardenBlueprintSection(
  md: string,
  requiredRows: number,
  allowedNames?: string[],
  currentLedger: NormalizedCurrentStackLedgerItem[] = [],
  berberineRequiresReview = false
) {
  const body = sectionChunk(md, "## Your Blueprint Recommendations");
  if (!body) return md;
  const rebuilt = `## Your Blueprint Recommendations\n\n${sanitizeBlueprintTable(body, requiredRows, allowedNames, currentLedger, berberineRequiresReview)}\n`;
  return md.replace(/## Your Blueprint Recommendations([\s\S]*?)(?=\n## |\n## END|$)/i, rebuilt);
}


function extractBlueprintTable(md: string): string | null {
  const s = stripCodeFences(md);
  // Find a markdown table that has the exact header (allow flexible spacing/case)
  const headerRe = /\| *Rank *\| *Supplement *\|(?: *Status *\|)? *Why it Matters *\|/i;
  if (!headerRe.test(s)) return null;
  // Capture the full table block lines around the header
  const lines = s.split(/\r?\n/);
  const idx = lines.findIndex((ln) => headerRe.test(ln));
  if (idx < 0) return null;

  // Scroll up to table start (first leading '|' row contiguous with header)
  let start = idx;
  while (start > 0 && /^\s*\|/.test(lines[start - 1])) start--;

  // Scroll down to table end (last '|' row)
  let end = idx;
  while (end + 1 < lines.length && /^\s*\|/.test(lines[end + 1])) end++;

  const table = lines.slice(start, end + 1).join("\n").trim();
  // Require a separator row like | --- | --- | --- |
  if (!/\|\s*-{3,}\s*\|/.test(table)) return null;
  return table;
}
function extractBlueprintTableLoose(md: string): string | null {
  const s = stripCodeFences(md);
  const lines = s.split(/\r?\n/);

  // find any header row that looks like a table
  const idx = lines.findIndex((ln) => /^\s*\|.+\|\s*$/.test(ln) && /\|\s*-{2,}\s*\|/.test(lines[lines.indexOf(ln)+1] || ""));
  if (idx < 0) return null;

  // capture contiguous table block
  let start = idx;
  while (start > 0 && /^\s*\|/.test(lines[start - 1])) start--;
  let end = idx;
  while (end + 1 < lines.length && /^\s*\|/.test(lines[end + 1])) end++;
  const table = lines.slice(start, end + 1).map(l => l.trimEnd());
  if (table.length < 2) return null;

  // parse header cells
  const headCells = table[0].split("|").map(c => c.trim().toLowerCase());
  const find = (alts: RegExp[]) => headCells.findIndex(h => alts.some(rx => rx.test(h)));

  const iRank = find([/rank/]);
  const iSupp = find([/supplement|item|product|nutrient|compound/]);
  const iWhy  = find([/why.*matters|rationale|benefit|reason/]);

  // must have at least these
  if (iRank < 0 || iSupp < 0 || iWhy < 0) return null;

  // rebuild as 3-column table
  const out: string[] = [];
  out.push("| Rank | Supplement | Why it Matters |");
  out.push("| --- | --- | --- |");

  for (let i = 2; i < table.length; i++) {
    const row = table[i];
    if (!/^\s*\|/.test(row)) continue;
    const cells = row.split("|").map(c => c.trim());
    const rank = (cells[iRank] ?? "").replace(/^\D+/, "") || String(i - 1);
    const supp = cells[iSupp] ?? "";
    const why  = cells[iWhy] ?? "See Dosing & Notes";
    if (!supp || /^tbd$/i.test(supp)) continue;
    out.push(`| ${rank} | ${supp} | ${why} |`);
  }
  // require 1+ data rows
  return out.length >= 3 ? out.join("\n") : null;
}
function synthesizeBlueprintFromIntake(sub: any): string {
  const header = "| Rank | Supplement | Why it Matters |\n| --- | --- | --- |\n";
  const fromIntake = ([] as string[])
    .concat((sub?.supplements ?? []).map((x:any) => cleanName(x?.name ?? x)))
    .filter(Boolean);

  const defaults = [
    "Omega-3", "Vitamin D", "Magnesium", "Soluble fiber", "Probiotic",
    "Vitamin B12", "Curcumin", "Green tea extract (EGCG)", "CoQ10", "Collagen"
  ];

  const dedup = (arr: string[]) => Array.from(new Set(arr.map(cleanName))).filter(Boolean);
  const names = dedup([...fromIntake, ...defaults]).slice(0, 10);

  const rows = names.map((name, i) => `| ${i + 1} | ${name} | See Dosing & Notes |`).join("\n");
  return header + rows + "\n";
}

// --- Pass-B tolerant detection + repair helpers ------------------------------

const CONTRA_HDR_RE =
  /^\s*#{2,3}\s*(contraindications?)(?:\s*&\s*|\s*and\s+)?(?:\s*(?:med(?:ication)?|drug))?\s*interactions?\s*:?\s*$/im;

const DOSING_HDR_RE =
  /^\s*#{2,3}\s*dosing\s*(?:&|and)?\s*notes\s*:?\s*$/im;

// Accept some common alternates (model creativity tax)
const ALT_CONTRA_HDR_RE =
  /^\s*#{2,3}\s*(interactions?|safety|risks?)\b.*$/im;
const ALT_DOSING_HDR_RE =
  /^\s*#{2,3}\s*(dosage|posology|instructions|how\s+to\s+take)\b.*$/im;

function hasContraSection(s: string) {
  return CONTRA_HDR_RE.test(s) || ALT_CONTRA_HDR_RE.test(s);
}
function hasDosingSection(s: string) {
  return DOSING_HDR_RE.test(s) || ALT_DOSING_HDR_RE.test(s);
}

// Normalize whatever headings the model used to the canonical H2s
function normalizePassBHeadings(s: string) {
  let out = s;
  // Normalize any Contra…/Interactions-like heading
  out = out.replace(
    /^\s*#{2,3}\s*(contraindications?.*interactions?.*)$/gim,
    "## Contraindications & Med Interactions"
  );
  out = out.replace(
    /^\s*#{2,3}\s*(interactions?|safety|risks?).*$/gim,
    "## Contraindications & Med Interactions"
  );

  // Normalize any Dosing…Notes-like heading
  out = out.replace(
    /^\s*#{2,3}\s*(dosing.*notes.*)$/gim,
    "## Dosing & Notes"
  );
  out = out.replace(
    /^\s*#{2,3}\s*(dosage|posology|instructions|how\s+to\s+take).*$/gim,
    "## Dosing & Notes"
  );
  return out;
}

// One-shot repair prompt that converts whatever came back into exactly the two sections we need
function formatRepairBPrompt(fullClient: any, blueprintTable: string, brokenText: string) {
  return `
You are reformatting model output.

### CLIENT (for context)
\`\`\`json
${JSON.stringify(fullClient, null, 2)}
\`\`\`

### BLUEPRINT TABLE (do not rewrite)
${brokenText.includes("| Rank |") ? "" : "\n"}${blueprintTable}

### BROKEN PASS-B TEXT (reformat only; do not invent new info)
${"```"}
${brokenText}
${"```"}

### TASK
Rewrite the BROKEN PASS-B TEXT into **exactly TWO H2 sections** with these exact headings, in this order:

## Contraindications & Med Interactions
## Dosing & Notes

Rules:
- Keep all real safety info and dosing notes; fix headings/format only.
- Bullets are fine; keep plain-English.
- No code fences, no extra sections, no intro/outro, no END line.
- Return ONLY those two sections in ASCII Markdown.
`.trim();
}

// --- Pass-C tolerant heading normalization ---
const PASSC_MAP: Array<{canon: string; variants: RegExp[]}> = [
  { canon: "## Intro Summary", variants: [/^\s*#{2,3}\s*(intro(?:duction)?\s*)?summary\b.*$/im] },
  { canon: "## Goals", variants: [/^\s*#{2,3}\s*goals?\b.*$/im] },
  { canon: "## Current Stack", variants: [/^\s*#{2,3}\s*current\s*(stack|supplements?)\b.*$/im] },
  { canon: "## Evidence & References", variants: [/^\s*#{2,3}\s*(evidence|references?)\b.*$/im] },
  { canon: "## Shopping Links", variants: [/^\s*#{2,3}\s*(shopping|links?)\b.*$/im] },
  { canon: "## Follow-up Plan", variants: [/^\s*#{2,3}\s*follow[-\s]*up\s*plan\b.*$/im] },
  { canon: "## Lifestyle Prescriptions", variants: [/^\s*#{2,3}\s*(lifestyle|habits?)\s*(prescriptions?|plan)?\b.*$/im] },
  { canon: "## Longevity Levers", variants: [/^\s*#{2,3}\s*longevity\s*(levers?|drivers?)\b.*$/im] },
  { canon: "## This Week Try", variants: [/^\s*#{2,3}\s*this\s*week\s*try\b.*$/im] },
];

function normalizePassCHeadings(md: string) {
  let out = md || "";
  for (const { canon, variants } of PASSC_MAP) {
    for (const rx of variants) {
      out = out.replace(rx, canon);
    }
  }
  return out;
}

function missingPassCHeadings(md: string) {
  const needed = PASSC_MAP.map(x => x.canon);
  return needed.filter(h => !sectionBodyMeaningful(md, h));
}

// One-shot reformat prompt to coerce headings/order for Pass C
function formatRepairCPrompt(fullClient: any, blueprintTable: string, dosingSection: string, brokenText: string) {
  return `
You are reformatting model output ONLY.

### CLIENT (context)
\`\`\`json
${JSON.stringify(fullClient, null, 2)}
\`\`\`

### GIVEN (do not rewrite)
**Blueprint Table**  
${blueprintTable}

**Contraindications & Dosing Section**  
${dosingSection}

### BROKEN PASS-C TEXT (reformat only)
\`\`\`
${brokenText}
\`\`\`

### TASK
Rewrite the BROKEN PASS-C TEXT into EXACTLY these H2 sections in this order:

## Intro Summary
## Goals
## Current Stack
## Evidence & References
## Shopping Links
## Follow-up Plan
## Lifestyle Prescriptions
## Longevity Levers
## This Week Try

Rules:
- Fix headings/levels/ordering only; keep the user-facing content.
- Plain ASCII Markdown. No code fences.
- Each section ends with an **Analysis** paragraph (≥3 sentences). If missing, summarize the existing content; do not invent clinical claims.
- Do not include an END marker.
`.trim();
}
function compactForPassC(sub: any) {
  // keep it lean to avoid timeouts
  const take = <T>(a: T[], n: number) => (Array.isArray(a) ? a.slice(0, n) : []);
  return {
    name: sub?.name ?? null,
    email: sub?.user_email ?? sub?.email ?? null,
    sex: sub?.sex ?? null,
    age: age(sub?.dob ?? null),
    goals: take(sub?.goals ?? [], 6),
    conditions: take(sub?.conditions ?? [], 8),
    allergies: take(sub?.allergies ?? [], 6),
    medications: take(sub?.medications ?? [], 10),
    supplements: take(sub?.supplements ?? [], 12),
    dosing_pref: sub?.dosing_pref ?? sub?.preferences?.dosing_pref ?? null,
    today: TODAY,
  };
}

// ----------------------------------------------------------------------------
// Name normalization + aliasing for evidence lookup
// ----------------------------------------------------------------------------
function normalizeSupplementName(name: string): string {
  if (!name) return "";
  const n = name.toLowerCase().replace(/[.*_`#]/g, "").trim();
  const collapsed = n.replace(/\s+/g, " ");
  if (collapsed === "l") return "L-Theanine";
  if (collapsed === "b") return "B-Vitamins";
  if (collapsed.includes("vitamin b complex") || collapsed.includes("b complex") || collapsed.includes("b-vitamins")) return "B-Vitamins";
  if (collapsed.startsWith("omega")) return "Omega-3";
  if (collapsed.startsWith("vitamin d")) return "Vitamin D";
  if (collapsed.startsWith("mag")) return "Magnesium";
  if (collapsed.startsWith("ashwa")) return "Ashwagandha";
  if (collapsed.startsWith("bacopa")) return "Bacopa Monnieri";
  if (collapsed.startsWith("coq")) return "CoQ10";
  if (collapsed.startsWith("creatine")) return "Creatine Monohydrate";
  if (collapsed.startsWith("curcumin") || collapsed.startsWith("turmeric")) return "Curcumin";
  if (collapsed.startsWith("probiotic")) return "Probiotic";
  if (collapsed.startsWith("collagen")) return "Collagen peptides";
  if (collapsed.includes("psyllium") || collapsed.startsWith("soluble fiber") || collapsed.startsWith("fiber (")) return "Soluble fiber (psyllium)";
  if (collapsed.startsWith("rhodiola")) return "Rhodiola Rosea";
  if (collapsed.startsWith("ginkgo")) return "Ginkgo Biloba";
  if (collapsed.startsWith("zinc")) return "Zinc";
  if (/^acetyl\s*l\b/.test(collapsed) || collapsed.includes("acetyl l carnitine") || collapsed.includes("acetyl-l-carnitine")) return "Acetyl-L-carnitine";
  return cleanName(name);
}

const ALIAS_MAP: Record<string, string> = {
  "Omega-3": "omega-3 (epa+dha)",
  "Vitamin D": "vitamin d3",
  "Magnesium": "magnesium (glycinate)",
  "Ashwagandha": "ashwagandha (ksm-66 or similar)",
  "Bacopa Monnieri": "bacopa monnieri (50% bacosides)",
  "CoQ10": "coq10 (ubiquinone)",
  "Creatine Monohydrate": "creatine (monohydrate)",
  "Curcumin": "curcumin (95% curcuminoids + piperine)",
  "Probiotic": "probiotic (lacto/bifido blend)",
  "Collagen peptides": "collagen peptides",
  "Soluble fiber (psyllium)": "fiber (psyllium husk)",
  "Rhodiola Rosea": "rhodiola rosea (3% rosavins)",
  "Ginkgo Biloba": "ginkgo biloba (24/6)",
  "Zinc": "zinc (picolinate)",
  "B-Vitamins": "b-complex",
  "B Vitamins Complex": "b-complex",
  "Vitamin B Complex": "b-complex",
  "L-Theanine": "l-theanine",
  "Acetyl-L-carnitine": "acetyl-l-carnitine",
};

function toSlug(s: string) {
  return (s || "").toLowerCase().replace(/[^\w\s()+\/.\-]/g, "").replace(/\s+/g, " ").trim();
}

function buildEvidenceCandidates(normName: string): string[] {
  const candidates: string[] = [];
  const alias = ALIAS_MAP[normName];
  if (alias) candidates.push(alias);
  const lower = toSlug(normName);
  if (lower) { candidates.push(lower, lower.replace(/\s+/g, "-"), lower.replace(/\s+/g, "")); }
  const expansions: Record<string, string[]> = {
    "Omega-3": ["omega-3 (epa+dha)", "omega-3", "omega 3"],
    "Vitamin D": ["vitamin d3", "vitamin d", "vitamin-d"],
    "Magnesium": ["magnesium (glycinate)", "magnesium"],
    "Ashwagandha": ["ashwagandha (ksm-66 or similar)", "ashwagandha"],
    "Bacopa Monnieri": ["bacopa monnieri (50% bacosides)", "bacopa monnieri"],
    "CoQ10": ["coq10 (ubiquinone)", "coq10"],
    "Creatine Monohydrate": ["creatine (monohydrate)", "creatine monohydrate", "creatine"],
    "Curcumin": ["curcumin (95% curcuminoids + piperine)", "curcumin", "turmeric"],
    "Probiotic": ["probiotic (lacto/bifido blend)", "probiotic", "probiotics"],
    "Collagen peptides": ["collagen peptides", "collagen peptide", "hydrolyzed collagen"],
    "Soluble fiber (psyllium)": ["fiber (psyllium husk)", "psyllium husk", "psyllium", "soluble fiber"],
    "Rhodiola Rosea": ["rhodiola rosea (3% rosavins)", "rhodiola rosea"],
    "Ginkgo Biloba": ["ginkgo biloba (24/6)", "ginkgo biloba"],
    "Zinc": ["zinc (picolinate)", "zinc"],
    "B-Vitamins": ["b-complex", "b vitamins", "b-vitamins"],
    "L-Theanine": ["l-theanine", "l theanine"],
    "Acetyl-L-carnitine": ["acetyl-l-carnitine", "acetyl l carnitine", "alc"],
  };
  if (expansions[normName]) candidates.push(...expansions[normName]);
  return Array.from(new Set(candidates)).filter(Boolean);
}

function sanitizeCitationsModel(urls: string[]): string[] {
  return asArray(urls).map((u) => (typeof u === "string" ? u.trim() : ""))
    .filter((u) => MODEL_CITE_RE.test(u));
}

function getTopCitationsFromJson(key: string, limit = 3): string[] {
  try {
    const arr = EVIDENCE?.[key] as EvidenceEntry[] | undefined;
    if (!arr || !Array.isArray(arr)) return [];
    const urls = arr.map((e) => (e?.url || "").trim()).filter((u) => CURATED_CITE_RE.test(u));
    return urls.slice(0, limit);
  } catch { return []; }
}

function lookupCuratedForCandidates(candidates: string[], limit = 3): string[] {
  for (const key of candidates) {
    const citations = getTopCitationsFor?.(key, 2) ?? [];
    if (citations.length) return citations;
  }
  const slugged = candidates.map(toSlug);
  for (const cand of slugged) {
    for (const jsonKey of Object.keys(EVIDENCE || {})) {
      const slugKey = toSlug(jsonKey);
      if (slugKey.includes(cand) || cand.includes(slugKey)) {
        const hits = getTopCitationsFromJson(jsonKey, limit);
        if (hits.length) { console.log("evidence.fuzzy_match", { cand, jsonKey, hits }); return hits; }
      }
    }
  }
  return [];
}

function attachEvidence(item: StackItem): StackItem {
  const normName = normalizeSupplementName(item.name);
  const candidates = buildEvidenceCandidates(normName);
  const curatedUrls = lookupCuratedForCandidates(candidates, 3);
  const modelValid = sanitizeCitationsModel(item.citations ?? []);
  const final = curatedUrls.length ? curatedUrls : modelValid;
  try { console.log("evidence.lookup", { rawName: item.name, normName, curatedCount: curatedUrls.length, keptFromModel: modelValid.length }); } catch {}
  return { ...item, name: normName, citations: final.length ? final : null };
}

function hostOf(u: string): string { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } }
function labelForUrl(u: string): string {
  const h = hostOf(u);
  if (/pubmed\.ncbi\.nlm\.nih\.gov/i.test(h)) return "PubMed";
  if (/pmc\.ncbi\.nlm\.nih\.gov/i.test(h)) return "PMC";
  if (/doi\.org/i.test(h)) return "DOI";
  if (/jamanetwork\.com/i.test(h)) return "JAMA";
  if (/biomedcentral\.com|bmcpsychiatry\.biomedcentral\.com|dmsjournal\.biomedcentral\.com/i.test(h)) return "BMC";
  if (/journals\.plos\.org|plos\.org/i.test(h)) return "PLOS";
  if (/nature\.com/i.test(h)) return "Nature";
  if (/sciencedirect\.com/i.test(h)) return "ScienceDirect";
  if (/amjmed\.com/i.test(h)) return "Am J Med";
  if (/koreascience\.kr/i.test(h)) return "KoreaScience";
  if (/monash\.edu/i.test(h)) return "Monash";
  return h || "Source";
}

function topUpCitations(minCount: number, have: Array<{ name: string; url: string }>) {
  const seen = new Set(have.map(h => h.url));
  const extras: Array<{ name: string; url: string }> = [];
  outer: for (const [key, arr] of Object.entries(EVIDENCE || {})) {
    const list = Array.isArray(arr) ? arr : [];
    for (const e of list) {
      const url = String(e?.url || "").trim();
      if (!url) continue;
      if (!(CURATED_CITE_RE.test(url) || MODEL_CITE_RE.test(url))) continue;
      if (seen.has(url)) continue;
      extras.push({ name: cleanName(key), url });
      seen.add(url);
      if (have.length + extras.length >= minCount) break outer;
    }
  }
  return extras;
}

function buildEvidenceSection(items: StackItem[], minCount = 8): {
  section: string; bullets: Array<{ name: string; url: string }>;
} {
  const bullets: Array<{ name: string; url: string }> = [];
  for (const it of asArray(items)) {
    for (const rawUrl of asArray(it.citations)) {
      const url = (rawUrl || "").trim();
      const normalized = url.endsWith("/") ? url : url + "/";
      if (CURATED_CITE_RE.test(normalized) || MODEL_CITE_RE.test(normalized)) {
        const label = `${cleanName(it.name)}${it.is_current ? " (Current Stack)" : ""}`;
        bullets.push({ name: label, url: normalized });
      }
    }
  }
  const seen = new Set<string>();
  let unique = bullets.filter(b => (seen.has(b.url) ? false : (seen.add(b.url), true)));

  const bulletsText = unique.map(b => `- ${b.name}: [${labelForUrl(b.url)}](${b.url})`).join("\n");
  const section =
    `## Evidence & References\n\n${bulletsText}\n\n` +
    `**Analysis**\n\nLinks prioritize PubMed/PMC/DOI and major journals and are limited to Blueprint recommendations plus clearly identified current-stack items. Sources are deduplicated; reports with fewer than ${minCount} aligned citations remain flagged for review rather than adding unrelated items.`;
  return { section, bullets: unique };
}


function overrideEvidenceInMarkdown(md: string, section: string): string {
  const headerRe = /## Evidence & References([\s\S]*?)(?=\n## |\n## END|$)/i;
  if (headerRe.test(md)) return md.replace(headerRe, section);
  return md.replace(/\n## END/i, `\n\n${section}\n\n## END`);
}

function buildShoppingLinksSection(items: StackItem[]): string {
  if (!items || items.length === 0) {
    return `## Shopping Links\n\n**Affiliate disclosure:** ${AFFILIATE_DISCLOSURE_NEAR_LINKS}\n\n- No links available yet.\n\n**Analysis**\n\nLinks will be provided once eligible products are mapped.`;
  }
  const bullets = items.map((it) => {
    const name = `${cleanName(it.name)}${it.is_current ? " (Current Stack)" : ""}`;
    const links: string[] = [];
    if (it.link_amazon) links.push(`[Amazon](${it.link_amazon})`);
    if (it.link_fullscript) links.push(`[Fullscript](${it.link_fullscript})`);
    if (it.link_thorne) links.push(`[Thorne](${it.link_thorne})`);
    if (it.link_other) links.push(`[Other](${it.link_other})`);
    return `- **${name}**: ${links.join(" • ")}`;
  });
  return `## Shopping Links\n\n**Affiliate disclosure:** ${AFFILIATE_DISCLOSURE_NEAR_LINKS}\n\n${bullets.join("\n")}\n\n**Analysis**\n\nThese links are optional conveniences. Product eligibility follows the same safety and recommendation rules used throughout this report.`;
}

function buildPracticalFollowUpSection(): string {
  return `## Follow-up Plan

- **Week 1:** Add no more than one new supplement. Keep the rest of the routine stable so any change is easier to interpret.
- **Week 2:** Record energy, sleep, digestion, and adherence two or three times during the week.
- **Weeks 4-6:** Compare the same measures with your starting point and keep only changes that are useful and well tolerated.
- **Recheck sooner:** Regenerate the Blueprint if a medication, supplement, health condition, or major goal changes.

**Analysis**

Use the smallest change that can be measured. Stop a newly added item if unexpected effects occur and seek appropriate care for urgent or severe symptoms.`;
}

// ----------------------------------------------------------------------------
// Prompts (3 passes: A table, B safety+dosing, C remaining sections)
// ----------------------------------------------------------------------------
function systemPromptA_TableOnly(): string {
  return `
You are **LVE360 Concierge AI**. Follow the user's task **exactly**.
Output **only** what is asked. No extra prose, no other sections, no code fences.
When asked for a table, return a **markdown table only**.
`.trim();
}

function systemPromptB_SafetyDosing(): string {
  return `
You are **LVE360 Concierge AI**, a supportive, plain-English wellness coach.
Task: produce **only** the sections requested by the user prompt.
Use clear, conservative guidance. No code fences. No extra sections.
`.trim();
}

function systemPromptC_RestOfReport(): string {
  return `
You are **LVE360 Concierge AI**, a friendly but professional wellness coach.
Return **plain ASCII Markdown only** with headings EXACTLY:

${HEADINGS.slice(0, -1).join("\n")}

Tables must use \`Column | Column\` pipe format, no curly quotes or bullets.
Every table/list MUST be followed by **Analysis** (≥3 sentences).
Section rules:
• Intro Summary → greet by name (if available).
• Goals → Table: Goal | Description, then Analysis.
• Current Stack → Table: Medication/Supplement | Purpose | Dosage | Timing, then Analysis.
• Your Blueprint Recommendations → Table: | Rank | Supplement | Why it Matters | with ≥10 rows; add “See Dosing & Notes…”.
• Dosing & Notes → bullets per item (dose/timing), end with Analysis.
• Evidence & References → ≥8 markdown links (PubMed/PMC/DOI etc.), then Analysis.
• Shopping Links → links + Analysis.
• Follow-up Plan, Lifestyle Prescriptions, Longevity Levers, This Week Try → each ends with Analysis.
Do not include an END marker.
`.trim();
}
function systemPromptC_Strict(): string {
  return `
You are LVE360 Concierge AI. Output **only ASCII Markdown** with **exactly** the sections below.
Return **exactly these nine H2 sections in this order**, nothing else:

## Intro Summary
## Goals
## Current Stack
## Evidence & References
## Shopping Links
## Follow-up Plan
## Lifestyle Prescriptions
## Longevity Levers
## This Week Try

Rules:
- Each section ends with an **Analysis** paragraph (≥3 sentences).
- Use the given Blueprint/Dosing for consistency (do not rewrite them).
- Evidence must include ≥8 valid links (PubMed/PMC/DOI or trusted journals).
- No code fences, preamble, or END marker.
`.trim();
}


function tableOnlyPrompt(
  compactClient: any,
  recommendableSupplementLedger: Array<{ name: string }>,
  berberineRequiresReview: boolean
) {
  return `
### CLIENT (Compact)
\`\`\`json
${JSON.stringify(compactClient, null, 2)}
\`\`\`

### RECOMMENDABLE SUPPLEMENT LEDGER
\`\`\`json
${JSON.stringify(recommendableSupplementLedger, null, 2)}
\`\`\`

### TASK
Output ONLY the section "## Your Blueprint Recommendations" as a Markdown table with the exact header:
| Rank | Supplement | Status | Why it Matters |

- Provide exactly **10** data rows (Rank 1..10).
- Include at least 4 "New - consider" rows, no more than 5 "Current - optimize" rows, and no more than 1 "Clinician review" row.
- Recommend goal-aligned supplement options only. Never recommend medications, prescription drugs, or hormones.
- Never recommend endocrine-active supplements such as DHEA or Pregnenolone by default.
- Select from the recommendable supplement ledger. Do not simply copy the Current Stack unless a legitimate current supplement has a clear optimization reason.
- Status must be exactly "Current - optimize" for a reported current supplement, "New - consider" for a new option, or "Clinician review" when coordinated review is needed.
- ${berberineRequiresReview ? "Do not include Berberine because glucose-lowering medication or blood-sugar context is present; choose another eligible lower-risk option." : "Include Berberine only when it is otherwise eligible and relevant."}
- Use short, plain-English rationales ("Why it Matters").
- If dosing/timing is relevant, write "See Dosing & Notes".
- Do NOT output any other text. Do NOT include END. Only the table.
`;
}

function safetyAndDosingPrompt(fullClient: any, blueprintTable: string) {
  const {
    payload_json: _payload,
    answers: _answers,
    engine_input_json: _engine,
    medications_text: _medicationsText,
    supplements_text: _supplementsText,
    hormones_text: _hormonesText,
    ...promptClient
  } = fullClient;
  return `
### CLIENT (Full)
\`\`\`json
${JSON.stringify(promptClient, null, 2)}
\`\`\`

### CANONICAL NORMALIZED CURRENT STACK LEDGER
\`\`\`json
${JSON.stringify(fullClient.normalizedCurrentStackLedger ?? [], null, 2)}
\`\`\`
Use this ledger as the only source of truth for current medications, supplements, hormones, and hormone-active supplements.

### GIVEN BLUEPRINT (exactly as provided)
\n**Blueprint Table**\n\n${blueprintTable}

### TASK
Generate ONLY these two sections, in this order:

## Contraindications & Med Interactions
- Identify potential conflicts among medications, hormones, and supplements.
- Highlight only material conflicts, spacing issues, or monitoring considerations; omit routine items with no specific flag.
- Group overlapping cautions, such as multiple sedating items, into one clear bullet.
- Prefix material bullets with "Monitor" or "Clinician review" according to severity.
- Call out classes (e.g., MAO-B risk, serotonin, anticoagulants).
- Avoid definitive safety statements and disease-treatment wording. Analysis must be last.
- Use plain English. End with **Analysis** (≥3 sentences).

## Dosing & Notes
- Bullet each recommended supplement with dose + timing (AM/PM/with meals) and short note.
- For a current Blueprint supplement with known dose or timing, write "Your reported routine: [dose], [timing]."
- Put non-Blueprint current items only under a separate "### Current Stack Notes" subsection.
- For Berberine with Metformin, Zepbound, diabetes, glucose, or blood-sugar context, require coordinated clinician review and do not imply it is appropriate to start.
- Reference meds/hormones when timing matters.
- End with **Analysis** (≥3 sentences).

Do NOT include any other sections. Do NOT repeat the Blueprint table. Do NOT include END.
`;
}

function remainingSectionsPrompt(fullClient: any, blueprintTable: string, dosingSection: string) {
  return `
### CLIENT (Full)
\`\`\`json
${JSON.stringify(fullClient, null, 2)}
\`\`\`

### GIVEN (do not rewrite)
\n**Blueprint Table**\n\n${blueprintTable}\n\n**Contraindications & Dosing Section**\n\n${dosingSection}

### TASK
Generate ONLY these sections, in this exact order, with **no placeholders**:

## Intro Summary
## Goals
## Current Stack
## Evidence & References
## Shopping Links
## Follow-up Plan
## Lifestyle Prescriptions
## Longevity Levers
## This Week Try

Rules:
- Keep language plain-English and encouraging (not clinical).
- Each section must end with an **Analysis** paragraph of ≥3 sentences.
- Evidence must include ≥8 valid links (PubMed/PMC/DOI and trusted journals).
- Do not include an END marker.
`;
}

// ---- Summary packer: compact payload for fast table-only pass ----
const MAX_MEDS = 15; const MAX_SUPPS = 20; const MAX_HORMONES = 10;
function pickTop<T>(arr: T[] | null | undefined, n: number) { const a = Array.isArray(arr) ? arr : []; return { items: a.slice(0, n), truncated: a.length > n, total: a.length }; }
function summarizeForLLM(sub: any) {
  const meds = pickTop(sub?.medications ?? sub?.meds ?? [], MAX_MEDS);
  const supps = pickTop(sub?.supplements ?? [], MAX_SUPPS);
  const hormones = pickTop(sub?.hormones ?? [], MAX_HORMONES);
  return {
    name: sub?.name ?? null,
    email: sub?.email ?? sub?.user_email ?? null,
    sex: sub?.sex ?? null,
    gender: sub?.gender ?? null,
    dob: sub?.dob ?? null,
    height: sub?.height ?? null,
    weight: sub?.weight ?? null,
    goals: sub?.goals ?? [],
    conditions: sub?.conditions ?? [],
    allergies: sub?.allergies ?? null,
    allergy_details: sub?.allergy_details ?? null,
    energy_rating: sub?.energy_rating ?? null,
    sleep_rating: sub?.sleep_rating ?? null,
    dosing_pref: sub?.dosing_pref ?? null,
    brand_pref: sub?.brand_pref ?? null,
    medications: meds.items,
    medications_meta: { truncated: meds.truncated, total: meds.total, limit: MAX_MEDS },
    supplements: supps.items,
    supplements_meta: { truncated: supps.truncated, total: supps.total, limit: MAX_SUPPS },
    hormones: hormones.items,
    hormones_meta: { truncated: hormones.truncated, total: hormones.total, limit: MAX_HORMONES },
    age: age(sub?.dob ?? null),
    today: TODAY,
  };
}

// ----------------------------------------------------------------------------
// Preference → Amazon category chooser, plus Premium Fullscript preference
// ----------------------------------------------------------------------------
function normalizeBrandPref(p?: string | null): "budget" | "trusted" | "clean" | "default" {
  const s = (p || "").toLowerCase();
  if (s.includes("budget") || s.includes("cost")) return "budget";
  if (s.includes("trusted") || s.includes("brand")) return "trusted";
  if (s.includes("clean")) return "clean";
  return "default";
}

function chooseAmazonLinkFor(item: StackItem, pref: "budget" | "trusted" | "clean" | "default"): string | null {
  const pick = pref === "budget" ? item.link_budget
    : pref === "trusted" ? item.link_trusted
    : pref === "clean" ? item.link_clean
    : item.link_default;
  return (
    pick || item.link_default || item.link_trusted || item.link_budget || item.link_clean || buildAmazonSearchLink(item.name, item.dose) || null
  );
}

function applyLinkPolicy(items: StackItem[], sub: any, mode: GenerateMode): StackItem[] {
  const pref = normalizeBrandPref(sub?.preferences?.brand_pref ?? sub?.brand_pref ?? null);
  const isPremium = mode === "premium" || Boolean(sub?.is_premium) || Boolean(sub?.user?.is_premium) || (sub?.plan === "premium");
  return asArray(items).map((it) => {
    const linkAmazon = chooseAmazonLinkFor(it, pref);
    const linkFS = it.link_fullscript ?? null;
    if (isPremium && linkFS) return { ...it, link_amazon: linkAmazon, link_fullscript: linkFS };
    return { ...it, link_amazon: linkAmazon };
  });
}

// ----------------------------------------------------------------------------
// Main export (accepts either string id OR {submissionId})
// ----------------------------------------------------------------------------
export async function generateStackForSubmission(arg: string | { submissionId: string }, options?: GenerateOptions) {
  const id = typeof arg === "string" ? arg : arg?.submissionId;
  if (!id) throw new Error("submissionId required");
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY missing");

  const sub = await getSubmissionWithChildren(id);
  if (!sub) throw new Error(`Submission row not found for id=${id}`);

  const modeFromOpts: GenerateMode | undefined = options?.mode;
  const requestedCap = typeof options?.maxItems === "number" ? clamp(options.maxItems, 1, 20) : undefined;

  const inferredPremium = Boolean((sub as any)?.is_premium) || Boolean((sub as any)?.user?.is_premium) || ((sub as any)?.plan === "premium");
  const mode: GenerateMode = modeFromOpts ?? (inferredPremium ? "premium" : "free");
  const cap = requestedCap; // only cap when provided

  const user_id = extractUserId(sub);
  const userEmail = (sub as any)?.user?.email ?? (sub as any)?.user_email ?? (sub as any)?.email ?? null;
  let modelUsed: string = "unknown";
  let promptTokens: number | null = null;
  let completionTokens: number | null = null;
  function extractFromAnswers(sub: any) {
  // answers can be: array of fields OR already-normalized object
  const answers = sub?.engine_input_json ?? sub?.answers ?? [];

  // If it’s already an object with keys, return it
  if (answers && typeof answers === "object" && !Array.isArray(answers)) return answers;

  // If it’s an array of { key, value, label, ... } (Tally fields), build a map
  const map: Record<string, any> = {};
  const append = (key: string, value: any) => {
    if (value == null) return;
    if (map[key] == null) map[key] = value;
    else map[key] = [...(Array.isArray(map[key]) ? map[key] : [map[key]]), ...(Array.isArray(value) ? value : [value])];
  };
  for (const f of answers ?? []) {
    const key = f?.key ?? f?.field?.key ?? f?.field?.id;
    if (!key) continue;
    const value = f?.value ?? f?.text ?? f?.answer ?? null;
    append(String(key), value);
    if (f?.label) append(`label::${String(f.label).toLowerCase()}`, value);
    if (f?.field?.label) append(`label::${String(f.field.label).toLowerCase()}`, value);
  }
  return map;
}

function getAnswer(map: Record<string, any>, key: string, labelCandidates: string[] = []) {
  if (key && map[key] != null) return map[key];
  for (const l of labelCandidates) {
    const v = map[`label::${l.toLowerCase()}`];
    if (v != null) return v;
  }
  return null;
}

function toList(v: any): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.map(String).map(s => s.trim()).filter(Boolean);
  return String(v)
    .split(/,|\n|;|\|/)
    .map(s => s.trim())
    .filter(Boolean);
}

const UUID_VALUE_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function readableAnswerMap(submission: any): Record<string, any> {
  let payload = submission?.payload_json ?? {};
  if (typeof payload === "string") {
    try { payload = JSON.parse(payload); } catch { payload = {}; }
  }
  const fields = [
    ...(Array.isArray(submission?.answers) ? submission.answers : []),
    ...(Array.isArray(payload?.data?.fields) ? payload.data.fields : []),
    ...(Array.isArray(payload?.form_response?.answers) ? payload.form_response.answers : []),
  ];
  const map: Record<string, any> = {};
  const append = (key: string, value: any) => {
    if (value == null) return;
    if (map[key] == null) map[key] = value;
    else map[key] = [...(Array.isArray(map[key]) ? map[key] : [map[key]]), ...(Array.isArray(value) ? value : [value])];
  };
  for (const field of fields) {
    const key = field?.key ?? field?.field?.key ?? field?.field?.id;
    const label = field?.label ?? field?.field?.label;
    const raw = field?.text ?? field?.email ?? field?.choice?.label ?? field?.choices?.labels ?? field?.value ?? field?.answer ?? null;
    const options = field?.options ?? field?.field?.options ?? [];
    const optionMap = new Map(
      options.map((option: any) => [String(option?.id ?? option?.value), String(option?.text ?? option?.label ?? option?.value ?? "")])
    );
    const resolve = (value: any) => {
      const scalar = value?.label ?? value?.text ?? value?.value ?? value;
      return optionMap.get(String(scalar)) || scalar;
    };
    const value = Array.isArray(raw) ? raw.map(resolve) : resolve(raw);
    if (key) append(String(key), value);
    if (label) append(`label::${String(label).trim().toLowerCase()}`, value);
  }
  return map;
}

function mergeReadableValues(stats: NormalizationStats, ...sources: any[]): { values: any[]; rawCount: number } {
  const merged = new Map<string, any>();
  let rawCount = 0;
  for (const source of sources) {
    rawCount += extractReadableNames(source, stats).length;
    for (const item of intakeItems(source)) {
      for (const name of extractReadableNames(item)) {
        if (UUID_VALUE_RE.test(name)) continue;
        const key = name.toLowerCase();
        const next = normalizedItemWithDetails(item, name);
        const prior = merged.get(key);
        if (!prior || (typeof prior === "string" && typeof next === "object")) merged.set(key, next);
      }
    }
  }
  return { values: Array.from(merged.values()), rawCount };
}
  // ---------- STAGED LLM PASSES ----------
  const ans = extractFromAnswers(sub);
const readableAns = readableAnswerMap(sub);
const engineInput = (sub as any)?.engine_input_json ?? {};
const normalizationStats: NormalizationStats = { rejectedObjectValues: 0 };

// Pull the “real” intake from answers first; fall back to columns second
const goalsMerged = mergeReadableValues(normalizationStats,
  engineInput?.goals, (sub as any)?.goals,
  getAnswer(readableAns, "question_o2lQ0N", ["what are your top health goals"]),
  getAnswer(ans, "question_o2lQ0N", ["what are your top health goals"])
);
const goalsRaw = goalsMerged.values;

const conditionsMerged = mergeReadableValues(normalizationStats,
  engineInput?.conditions, (sub as any)?.conditions,
  getAnswer(readableAns, "question_7K5Yj6", ["do you have any current health conditions"]),
  getAnswer(ans, "question_7K5Yj6", ["do you have any current health conditions"])
);
const conditionsRaw = conditionsMerged.values;

const currentStackLedger = buildNormalizedCurrentStackLedger(sub).filter((item) =>
  !isPreferenceFieldOrValue(item.name) && !item.raw_labels.some(isPreferenceFieldOrValue)
);
const berberineRequiresReview = /\b(?:metformin|zepbound|tirzepatide|mounjaro|diabet(?:es|ic)?|blood sugar|glucose|a1c)\b/i.test(
  JSON.stringify({ currentStackLedger, conditions: conditionsRaw })
);
const recommendableSupplementLedger = Array.from(new Set([
  ...RECOMMENDABLE_SUPPLEMENT_CANDIDATES,
  ...currentStackLedger
    .filter((item) => item.kind === "supplement" && isEligibleSupplementName(item.name))
    .map((item) => item.name),
])).map((name) => ({ name }));
const missingRepeatedTallyItems = findMissingRepeatedTallyItems(sub, currentStackLedger);
if (missingRepeatedTallyItems.length) {
  console.warn("[gen.intake] repeated Tally fields missing from ledger", missingRepeatedTallyItems);
  throw new Error(`Current stack ledger omitted repeated Tally items: ${missingRepeatedTallyItems.join(", ")}`);
}
if (currentStackLedger.some((item) =>
  isMalformedCurrentStackName(item.name) || UUID_VALUE_RE.test(item.name) || OBJECT_STRING_RE.test(item.name)
)) {
  throw new Error("Invalid current stack ledger item name");
}
const ledgerItems = (kind: NormalizedCurrentStackLedgerItem["kind"]) => currentStackLedger
  .filter((item) => item.kind === kind)
  .map((item) => ({
    name: item.name,
    purpose: item.purpose,
    dose: item.dose,
    timing: item.timing,
    source_paths: item.source_paths,
    raw_labels: item.raw_labels,
  }));
const medicationsRaw = ledgerItems("medication");
const supplementsRaw = ledgerItems("supplement");
const hormonesRaw = ledgerItems("hormone");
const endocrineActiveRaw = ledgerItems("endocrine_active_supplement");

// ONE source of truth for the rest of the file:
const baseClient = {
  ...sub,
  goals: goalsRaw,
  conditions: conditionsRaw,
  medications: medicationsRaw,
  supplements: supplementsRaw,
  hormones: hormonesRaw,
  endocrine_active_supplements: endocrineActiveRaw,
  normalizedCurrentStackLedger: currentStackLedger,
  recommendableSupplementLedger,
};

const compactClient = summarizeForLLM(baseClient);
const fullClient = { ...baseClient, age: age((baseClient as any).dob ?? null), today: TODAY };
const currentNames = currentStackLedger.map((item) => item.name);
console.info("[gen.intake.check]", {
  normalized_goals: (baseClient as any).goals,
  normalized_conditions: (baseClient as any).conditions,
  normalized_medications: (baseClient as any).medications,
  normalized_supplements: (baseClient as any).supplements,
  normalized_hormones: (baseClient as any).hormones,
  normalized_endocrine_active_supplements: (baseClient as any).endocrine_active_supplements,
  medications_normalized_count: medicationsRaw.length,
  supplements_normalized_count: supplementsRaw.length,
  hormones_normalized_count: hormonesRaw.length,
  endocrine_active_supplements_normalized_count: endocrineActiveRaw.length,
  rejected_object_values_count: normalizationStats.rejectedObjectValues,
  ledger_total_count: currentStackLedger.length,
  ledger_medication_count: medicationsRaw.length,
  ledger_supplement_count: supplementsRaw.length,
  ledger_hormone_count: hormonesRaw.length,
  ledger_endocrine_active_supplement_count: endocrineActiveRaw.length,
  ledger_item_names: currentNames,
  ledger_source_paths_by_item: Object.fromEntries(currentStackLedger.map((item) => [`${item.kind}:${item.name}`, item.source_paths])),
  current_stack_rendered_count: currentStackLedger.length,
  current_stack_ledger_total: currentStackLedger.length,
  current_stack_medication_names: medicationsRaw.map((item) => item.name),
  current_stack_supplement_names: supplementsRaw.map((item) => item.name),
  current_stack_hormone_names: hormonesRaw.map((item) => item.name),
  current_stack_source_fields: Object.fromEntries(currentStackLedger.map((item) => [
    `${item.kind}:${item.name}`,
    { labels: item.raw_labels, paths: item.source_paths },
  ])),
});
// PASS A: Blueprint Table (mini first)
console.info("[gen.passA:start]", { candidates: candidateModels("mini") });

const resA = await callChatWithRetry("mini", [
  { role: "system", content: systemPromptA_TableOnly() },
  { role: "user", content: tableOnlyPrompt(compactClient, recommendableSupplementLedger, berberineRequiresReview) },
]);

const rawA = stripCodeFences(String(resA?.text ?? "").trim());
let tableMd = extractBlueprintTable(rawA) || extractBlueprintTableLoose(rawA);

if (!tableMd) {
  // One-shot repair ask: convert whatever came back into the exact table
  const repairPromptA = `
Convert the text below into a single Markdown table ONLY with header exactly:
| Rank | Supplement | Status | Why it Matters |

- Provide exactly 10 data rows (Rank 1..10).
- Include at least 4 "New - consider" rows, no more than 5 "Current - optimize" rows, and no more than 1 "Clinician review" row.
- Short, plain-English "Why it Matters".
- If dose/timing is relevant, write "See Dosing & Notes".
- No other text. No code fences.
---
${rawA}
`.trim();

  try {
    const resARepair = await callChatWithRetry("mini", [
      { role: "system", content: systemPromptA_TableOnly() },
      { role: "user", content: repairPromptA },
    ], { maxTokens: 600, timeoutMs: 45_000 });

    const repaired = stripCodeFences(String(resARepair?.text ?? "").trim());
    tableMd = extractBlueprintTable(repaired) || extractBlueprintTableLoose(repaired) || null;
  } catch (_) { /* continue to synth */ }
}

if (!tableMd) {
  console.warn("[passA] falling back to synthesized table from intake/defaults");
  tableMd = synthesizeBlueprintFromIntake(fullClient);
}
tableMd = sanitizeBlueprintTable(
  tableMd,
  BLUEPRINT_MIN_ROWS,
  recommendableSupplementLedger.map((item) => item.name),
  currentStackLedger,
  berberineRequiresReview
);


// token accounting (if available)
if (resA?.usage?.prompt_tokens) promptTokens = (promptTokens ?? 0) + (resA.usage.prompt_tokens ?? 0);
if (resA?.usage?.completion_tokens) completionTokens = (completionTokens ?? 0) + (resA.usage.completion_tokens ?? 0);
modelUsed = resA?.modelUsed ?? modelUsed;

// ---- Local fallback for Pass B (no LLM) ------------------------------------
function synthesizePassBFromLocal(sub: any, blueprintTable: string) {
  // 1) grab item names from the Blueprint table
  const names = Array.from(blueprintTable.matchAll(/\|\s*\d+\s*\|\s*([^|]+)\|/g))
    .map(m => (m[1] || "").trim())
    .filter(Boolean)
    .slice(0, 12);

  // Normalize using your existing helper
  const normNames = names.map(n => normalizeSupplementName(n));

  // 2) simple dosing defaults for common items (plain English, safe)
  const DOSE: Record<string, string> = {
    "Omega-3": "1000 mg EPA+DHA daily with a meal (AM/PM).",
    "Vitamin D": "1000–2000 IU daily with food; adjust per 25-OH labs.",
    "Magnesium": "200–400 mg (glycinate) in the evening; separate from antibiotics by ≥2h.",
    "Soluble fiber": "1 serving (psyllium) with water before a meal; separate meds by 2–3h.",
    "Probiotic": "1 capsule daily with food; stop if GI symptoms worsen.",
    "Vitamin B12": "500–1000 mcg daily or per label; useful if on metformin.",
    "Curcumin": "500–1000 mg daily with food; pick a standardized extract.",
    "Green tea extract (EGCG)": "300–400 mg earlier in the day; avoid late PM.",
    "CoQ10": "100–200 mg with a meal (often AM).",
    "Collagen": "10–20 g daily; mix into coffee or smoothies.",
  };

  const dosingLines = normNames.map(n => {
    const base = DOSE[n] || "Use label-directed dose; start low, increase as tolerated.";
    return `- **${n}** — ${base}`;
  });

  // 3) safety heuristics using intake
  const medsArr = Array.isArray(sub?.medications) ? sub.medications : [];
  const condArr = Array.isArray(sub?.conditions) ? sub.conditions : [];
  const medsText = JSON.stringify(medsArr).toLowerCase();
  const condText = JSON.stringify(condArr).toLowerCase();

  const onBloodThinner = /(warfarin|coumadin|apixaban|eliquis|clopidogrel|plavix|xarelto|aspirin)/i.test(medsText);
  const onSSRIorMAOI = /(fluox|sertral|citalo|parox|venlafax|dulox|maoi|selegiline|phenelzine)/i.test(medsText);
  const bpMeds = /(losartan|lisinopril|amlodipine|metoprolol|hctz|hydrochloro)/i.test(medsText);
  const kidneyIssues = /(ckd|kidney)/i.test(condText);
  const liverIssues = /(liver|hepatic)/i.test(condText);
  const immuneSuppressed = /(immun|chemo|steroid)/i.test(condText) || /(predni|methotrex|tacro|cyclo)/i.test(medsText);

  const safety: string[] = [];
  if (onBloodThinner) {
    safety.push(
      "- **Bleeding risk:** Omega-3 and Curcumin may increase bleeding tendency; coordinate with your clinician and pause before procedures."
    );
  }
  if (bpMeds) {
    safety.push("- **Blood pressure:** CoQ10 and Magnesium may lower BP slightly; monitor if on antihypertensives.");
  }
  if (onSSRIorMAOI) {
    safety.push("- **Mood meds:** Avoid serotonergic herbs (e.g., St. John’s Wort). Current Blueprint avoids these by default.");
  }
  safety.push("- **Antibiotics/minerals:** Separate Magnesium and fiber from antibiotics or thyroid meds by 2–3 hours.");
  if (kidneyIssues) safety.push("- **Kidney disease:** Use Vitamin D and Magnesium under clinician guidance.");
  if (liverIssues) safety.push("- **Liver caution:** Use concentrated EGCG (green tea extract) cautiously; discontinue if you notice malaise/dark urine/abdominal pain.");
  if (immuneSuppressed) safety.push("- **Immune status:** Use probiotics with caution if significantly immunocompromised (ask your clinician).");

  // Build the two sections
  const contraSection =
    `## Contraindications & Med Interactions\n\n` +
    (safety.length ? safety.map(s => s).join("\n") : "- No specific conflicts detected from your intake. Use standard care and consult your clinician.") +
    `\n\n**Analysis**\n\nThese guardrails are generated from your reported meds/conditions and common supplement cautions (e.g., bleeding risk, antibiotic spacing, liver/kidney considerations). Please consult your clinician for personalized guidance.`;

  const dosingSection =
    `## Dosing & Notes\n\n` +
    (dosingLines.length ? dosingLines.join("\n") : "- Dosing will populate once your Blueprint table is available.") +
    `\n\n**Analysis**\n\nDoses favor low-to-moderate ranges, food timing for tolerability, and practical spacing around prescriptions. Adjust based on lab values and provider feedback.`;

  return { contraSection, dosingSection };
}

// PASS B: Contraindications + Dosing (tolerant detection + self-repair)
console.info("[gen.passB:start]", { candidates: candidateModels("mini") });

const resB = await callChatWithRetry(
  "mini",
  [
    { role: "system", content: systemPromptB_SafetyDosing() },
    { role: "user", content: safetyAndDosingPrompt(fullClient, tableMd) },
  ],
  { maxTokens: 1600, timeoutMs: LLM_TIMEOUT_MS }
);


// Tolerant normalize/repair for Pass B (LOCAL HELPERS — scoped to avoid collisions)
const _hasContra = (s: string) =>
  /^\s*#{2,3}\s*(contraindications?)(?:\s*&\s*|\s*and\s+)?(?:\s*(?:med(?:ication)?|drug))?\s*interactions?\s*:?\s*$/im.test(s) ||
  /^\s*#{2,3}\s*(interactions?|safety|risks?)\b.*$/im.test(s);

const _hasDosing = (s: string) =>
  /^\s*#{2,3}\s*dosing\s*(?:&|and)?\s*notes\s*:?\s*$/im.test(s) ||
  /^\s*#{2,3}\s*(dosage|posology|instructions|how\s+to\s+take)\b.*$/im.test(s);

const _normalizeB = (s: string) => s
  .replace(/^\s*#{2,3}\s*(contraindications?.*interactions?.*)$/gim, "## Contraindications & Med Interactions")
  .replace(/^\s*#{2,3}\s*(interactions?|safety|risks?).*$/gim,       "## Contraindications & Med Interactions")
  .replace(/^\s*#{2,3}\s*(dosing.*notes.*)$/gim,                     "## Dosing & Notes")
  .replace(/^\s*#{2,3}\s*(dosage|posology|instructions|how\s+to\s+take).*$/gim, "## Dosing & Notes");

let dosingMdRaw = String(resB?.text ?? "").trim();
let dosingMd = _normalizeB(stripCodeFences(dosingMdRaw));
let hasContra = _hasContra(dosingMd);
let hasDosing = _hasDosing(dosingMd);

  
// If headings missing, one-shot repair with mini
if (!hasContra || !hasDosing) {
  const repairPrompt = `
You are reformatting model output.

### CLIENT (for context)
\`\`\`json
${JSON.stringify(fullClient, null, 2)}
\`\`\`

### BLUEPRINT TABLE (do not rewrite)
${tableMd}

### BROKEN PASS-B TEXT (reformat only)
\`\`\`
${dosingMdRaw}
\`\`\`

### TASK
Rewrite the BROKEN PASS-B TEXT into **exactly TWO H2 sections** with these exact headings, in this order:

## Contraindications & Med Interactions
## Dosing & Notes

Rules:
- Keep the safety info and dosing notes; fix headings/format only.
- Bullets are fine; keep plain-English.
- No code fences, no extra sections, no intro/outro, no END line.
- Return ONLY those two sections in ASCII Markdown.
`.trim();

  await wait(700);

  const resRepairMini = await callChatWithRetry("mini", [
    { role: "system", content: systemPromptB_SafetyDosing() },
    { role: "user", content: repairPrompt },
  ]);

  const repairedMini = _normalizeB(stripCodeFences(String(resRepairMini?.text ?? "").trim()));
  if (_hasContra(repairedMini) && _hasDosing(repairedMini)) {
    dosingMd = repairedMini;
  } else {
    
    await wait(700);

    // Try once with main model
    const resRepairMain = await callChatWithRetry("main", [
      { role: "system", content: systemPromptB_SafetyDosing() },
      { role: "user", content: repairPrompt },
    ]);
    const repairedMain = _normalizeB(stripCodeFences(String(resRepairMain?.text ?? "").trim()));
    if (_hasContra(repairedMain) && _hasDosing(repairedMain)) {
      dosingMd = repairedMain;
    }
  }

  hasContra = _hasContra(dosingMd);
  hasDosing = _hasDosing(dosingMd);
}

const passBHasBodies = () =>
  sectionBodyMeaningful(dosingMd, "## Contraindications & Med Interactions") &&
  sectionBodyMeaningful(dosingMd, "## Dosing & Notes");

if (!hasContra || !hasDosing || !passBHasBodies()) {
  console.warn("[passB] missing after repair — using local fallback");
  const local = synthesizePassBFromLocal(fullClient, tableMd || "");
  dosingMd = `${local.contraSection}\n\n${local.dosingSection}`;
  // re-evaluate
  hasContra = _hasContra(dosingMd);
  hasDosing = _hasDosing(dosingMd);
}
dosingMd = ensureContraCurrentStackCoverage(dosingMd, currentStackLedger, berberineRequiresReview);


// token accounting (wrapper exposes usage.*)
if (resB?.usage?.prompt_tokens) promptTokens = (promptTokens ?? 0) + (resB.usage.prompt_tokens ?? 0);
if (resB?.usage?.completion_tokens) completionTokens = (completionTokens ?? 0) + (resB.usage.completion_tokens ?? 0);
modelUsed = resB?.modelUsed ?? modelUsed;

  const PASSC_REQUIRED = [
  "## Intro Summary",
  "## Goals",
  "## Current Stack",
  "## Evidence & References",
  "## Shopping Links",
  "## Follow-up Plan",
  "## Lifestyle Prescriptions",
  "## Longevity Levers",
  "## This Week Try",
];

// PASS C: Remaining sections (use GPT-5 main, bigger headroom)
console.info("[gen.passC:start]", { candidates: candidateModels("main") });

let resC = await callChatWithRetry(
  "main", // we’ll ask for main and pass a GPT-5 model name explicitly
  [
    { role: "system", content: systemPromptC_Strict() },
    { role: "user", content: remainingSectionsPrompt(compactForPassC(baseClient), tableMd, dosingMd) },
  ],
  { maxTokens: 2000, timeoutMs: 120_000 } // a bit more room for 9 narrative sections
);


// Parse result up front (so we don't reference undefined vars)
let restMd = normalizePassCHeadings(stripCodeFences(String(resC?.text ?? "").trim()));
let missing = missingPassCHeadings(restMd);
if (missing.length) console.warn("[passC] empty or missing section bodies:", missing);
let tooShort = restMd.replace(/\s+/g, " ").length < 80;

// If missing, try a quick repair with mini
if (missing.length) {
  console.warn("[passC] missing sections (mini result):", missing);
  const repairPrompt = `
You received Markdown with some of the nine required sections. 
Rewrite **only the missing sections** listed below. 
- Use the same style/tone as the provided text.
- Do not repeat sections that already exist.
- ASCII Markdown only, no code fences.

Missing sections:
${missing.map(m => `- ${m}`).join("\n")}

Context (do not alter):
- Keep consistent with the Blueprint table and Dosing section.
`.trim();

  const resRepairMini = await callChatWithRetry("mini", [
    { role: "system", content: systemPromptC_Strict() },
    { role: "user", content: repairPrompt },
  ], { maxTokens: 700, timeoutMs: 90_000 });

  const addMini = normalizePassCHeadings(stripCodeFences(String(resRepairMini?.text ?? "").trim()));
  restMd = (restMd + "\n\n" + addMini).trim();
  missing = missingPassCHeadings(restMd);
  tooShort = restMd.replace(/\s+/g, " ").length < 80;
}

// If still missing, one more repair with main
if (missing.length) {
  console.warn("[passC] still missing after mini repair; trying main:", missing);
  const repairPromptMain = `
Generate **only** these missing sections in ASCII Markdown:
${missing.map(m => `- ${m}`).join("\n")}
Each ends with an **Analysis** paragraph (≥3 sentences).
Keep consistent with the earlier Blueprint and Dosing.
No other sections, no code fences.
`.trim();

  const resRepairMain = await callChatWithRetry("main", [
    { role: "system", content: systemPromptC_Strict() },
    { role: "user", content: repairPromptMain },
  ], { maxTokens: 900, timeoutMs: 120_000 });

  const addMain = normalizePassCHeadings(stripCodeFences(String(resRepairMain?.text ?? "").trim()));
  restMd = (restMd + "\n\n" + addMain).trim();
  missing = missingPassCHeadings(restMd);
  tooShort = restMd.replace(/\s+/g, " ").length < 80;
}

// Local synth if empty/garbled
if (tooShort || missing.length >= 9) {
  console.warn("[passC] empty/garbled first pass; synthesizing sections locally");
  const userName = sub?.name ? String(sub.name).split(" ")[0] : "there";
  const analysis3 = (topic: string) =>
    `**Analysis**\n\nThis section focuses on ${topic} with practical, low-risk steps you can apply immediately. ` +
    `We emphasize simple, sustainable habits so the plan works even on busy weeks. ` +
    `We’ll review progress in a few weeks and tune doses/timing based on your feedback.\n`;
  const synth = (h: string, body: string, topic: string) =>
    `${h}\n\n${body}\n\n${analysis3(topic)}\n`;

  const blocks = [
    synth("## Intro Summary",
      `Hi ${userName}! Based on your intake and preferences, here’s a concise plan aligned to your goals. ` +
      `Your Blueprint lays out the “what” and “why,” while Dosing & Notes explains the “how”—amounts, timing, and safety.`,
      "your overall plan"),
    synth("## Goals",
      `| Goal | Description |\n| --- | --- |\n| Primary | Improve energy, metabolic health, and sleep |\n| Secondary | Support cardiovascular and cognitive health |`,
      "defining clear targets"),
    synth("## Current Stack",
      `No current medications or supplements were included in the intake. Review this section if your routine changes.`,
      "what you already take"),
    synth("## Evidence & References",
      `- Evidence pending. See curated citations attached to items.\n- We prioritize PubMed/PMC/DOI and major journals.`,
      "how we support claims"),
    synth("## Shopping Links",
      `Links are provided for convenience. Choose based on budget/trusted/clean preference.`,
      "practical purchasing"),
    synth("## Follow-up Plan",
      `- Re-check energy, sleep, and digestion in 2–3 weeks.\n- Review labs in 8–12 weeks.\n- Adjust doses or timing if side effects appear.`,
      "closing the feedback loop"),
    synth("## Lifestyle Prescriptions",
      `- Walk 20–30 minutes after the largest meal.\n- Prioritize 7–8 hours of sleep.\n- Aim for 90–120g protein/day.`,
      "daily behaviors"),
    synth("## Longevity Levers",
      `- Resistance training 2–3×/week.\n- Keep visceral fat low; monitor waist:height.\n- Periodic labs to personalize dosing.`,
      "long-term outcomes"),
    synth("## This Week Try",
      `- AM: 10-minute sunlight + water before caffeine.\n- Midday: 10-minute walk after lunch.\n- PM: Dim screens after 9pm; in bed by 10pm.`,
      "quick wins this week"),
  ];
  restMd = blocks.join("\n\n");
  missing = [];
}

// Final backfill of any still-missing sections
if (missing.length) {
  const userName = sub?.name ? String(sub.name).split(" ")[0] : "there";
  const analysis3 = (topic: string) =>
    `**Analysis**\n\nThis section focuses on ${topic} with practical, low-risk steps you can apply immediately. ` +
    `We emphasize simple, sustainable habits so the plan works even on busy weeks. ` +
    `We’ll review progress in a few weeks and tune doses/timing based on your feedback.\n`;
  const synth = (h: string, body: string, topic: string) => `${h}\n\n${body}\n\n${analysis3(topic)}\n`;

  const add: string[] = [];
  for (const h of missing) {
    if (h === "## Intro Summary") add.push(synth(h, `Hi ${userName}! Based on your intake, here’s a concise plan aligned to your goals.`, "your overall plan"));
    else if (h === "## Goals") add.push(synth(h, `| Goal | Description |\n| --- | --- |\n| Primary | Improve energy, metabolic health, and sleep quality |\n| Secondary | Support cardiovascular and cognitive health |`, "defining clear targets"));
    else if (h === "## Current Stack") add.push(synth(h, `No current medications or supplements were included in the intake. Review this section if your routine changes.`, "what you already take"));
    else if (h === "## Evidence & References") add.push(synth(h, `- Evidence pending. See curated citations attached to items.\n- We prioritize PubMed/PMC/DOI and major journals.`, "how we support claims"));
    else if (h === "## Shopping Links") add.push(synth(h, `Links are provided for convenience. Choose based on budget/trusted/clean preference.`, "practical purchasing"));
    else if (h === "## Follow-up Plan") add.push(synth(h, `- Re-check energy, sleep, and digestion in 2–3 weeks.\n- Review labs (lipids, A1C, vitamin D) in 8–12 weeks.\n- Adjust doses/timing if conflicts appear.`, "closing the feedback loop"));
    else if (h === "## Lifestyle Prescriptions") add.push(synth(h, `- Walk 20–30 minutes after your largest meal.\n- Prioritize 7–8 hours sleep; dim lights 1 hour before bed.\n- Aim for 90–120g protein/day.`, "daily behaviors"));
    else if (h === "## Longevity Levers") add.push(synth(h, `- Resistance training 2–3×/week; progressive overload.\n- Keep visceral fat low; monitor waist:height.\n- Periodic labs to personalize micronutrients.`, "long-term outcomes"));
    else if (h === "## This Week Try") add.push(synth(h, `- AM: 10-minute sunlight + water before caffeine.\n- Midday: 10-minute walk after lunch.\n- PM: Screens dimmed after 9pm; in bed by 10pm.`, "quick wins this week"));
  }
  for (const block of add) restMd = replaceOrAppendSection(restMd, block);
}

// token accounting
if (resC?.usage?.prompt_tokens) promptTokens = (promptTokens ?? 0) + (resC.usage.prompt_tokens ?? 0);
if (resC?.usage?.completion_tokens) completionTokens = (completionTokens ?? 0) + (resC.usage.completion_tokens ?? 0);
modelUsed = resC?.modelUsed ?? modelUsed;

  // ---------- Stitch full Markdown in canonical user-facing order ----------
restMd = replaceOrAppendSection(restMd, buildCurrentStackSection(currentStackLedger));
let md = assembleCanonicalReport(restMd, tableMd, dosingMd, currentStackLedger, berberineRequiresReview);
md = replaceOrAppendSection(md, buildPracticalFollowUpSection());


  // Sanity: enforce headings and pad the Blueprint without exposing END.
  md = forceHeadings(md);
  md = hardenBlueprintSection(
    md,
    computeValidationTargets(mode, cap).minRows,
    recommendableSupplementLedger.map((item) => item.name),
    currentStackLedger,
    berberineRequiresReview
  );
  md = ensureReportDosingAlignment(md, currentStackLedger, berberineRequiresReview);

  // ---------- Parse items / safety / enrichment ----------
  const TIMING_ARTIFACT_RE = /^(on\s+waking|am\b.*breakfast|evening\b.*dinner|before\s+bed|pre[- ]?exercise(?:.*)?|hold\/adjust|simplify\s+sleep\s+aids)$/i;
  function looksLikeTimingArtifact(name?: string | null) {
    const s = (name || "").trim();
    if (!s) return false;
    if (/\d/.test(s)) return false; // keep likely product strings with numbers
    return TIMING_ARTIFACT_RE.test(s);
  }

  const allowedItemNames = new Set(
    [...blueprintNames(tableMd), ...currentNames].map((name) => normalizeSupplementName(name).toLowerCase())
  );
  const parsedItemsRaw = (parseMarkdownToItems(md) as any[]).filter((item) => {
    const name = validItemName(item?.name);
    return Boolean(name && allowedItemNames.has(normalizeSupplementName(name).toLowerCase()));
  });
  const rawCapped = typeof cap === "number" ? asArray(parsedItemsRaw).slice(0, cap) : asArray(parsedItemsRaw);
  const baseItems: StackItem[] = rawCapped.map((i: any) => ({ ...i, is_current: i?.is_current === true }));
  const filteredItems: StackItem[] = baseItems.filter((it) => {
    const n = validItemName(it?.name);
    if (!n || n === "---") return false;
    return !looksLikeTimingArtifact(n);
  });

  type SafetyStatus = "safe" | "warning" | "error";
  interface SafetyOutput { cleaned: StackItem[]; status: SafetyStatus }
const safetyInput = {
  medications: Array.isArray((baseClient as any).medications)
    ? (baseClient as any).medications.map((m: any) => m?.med_name || m?.name || m)
    : [],
  conditions: Array.isArray((baseClient as any).conditions)
    ? (baseClient as any).conditions.map((c: any) => c?.condition_name || c?.name || c)
    : [],
  allergies: Array.isArray((baseClient as any).allergies)
    ? (baseClient as any).allergies.map((a: any) => a?.allergy_name || a?.name || a)
    : [],
  pregnant:
    typeof (baseClient as any).pregnant === "boolean" || typeof (baseClient as any).pregnant === "string"
      ? (baseClient as any).pregnant
      : null,
  brand_pref: (baseClient as any)?.preferences?.brand_pref ?? (baseClient as any)?.brand_pref ?? null,
  dosing_pref: (baseClient as any)?.preferences?.dosing_pref ?? (baseClient as any)?.dosing_pref ?? null,
  is_premium: mode === "premium",
};

  let safetyStatus: SafetyStatus = "warning";
  let cleanedItems: StackItem[] = filteredItems;
  try {
    const res = (await applySafetyChecks(safetyInput, filteredItems)) as Partial<SafetyOutput> | null;
    cleanedItems = asArray<StackItem>((res?.cleaned as StackItem[]) ?? filteredItems);
    const st = (res as any)?.status; safetyStatus = st === "safe" ? "safe" : st === "error" ? "error" : "warning";
  } catch (e) { console.warn("applySafetyChecks failed; continuing with uncautioned items.", e); }

  const itemKey = (name: string) => normalizeSupplementName(name).toLowerCase();
  const currentKindByName = new Map(currentStackLedger.map((item) => [itemKey(item.name), item.kind]));
  const blueprintShoppableNames = new Set(blueprintNames(tableMd).filter(isEligibleSupplementName).map(itemKey));
  const shoppableNames = new Set([
    ...blueprintNames(tableMd).filter(isEligibleSupplementName),
    ...currentStackLedger.filter((item) => item.kind === "supplement" && isEligibleSupplementName(item.name)).map((item) => item.name),
  ].map(itemKey));
  const isShoppableItem = (item: StackItem) => {
    const key = itemKey(item.name);
    const currentKind = currentKindByName.get(key);
    if (berberineRequiresReview && /^berberine(?:\s+hcl)?$/i.test(item.name)) return false;
    return shoppableNames.has(key) && isEligibleSupplementName(item.name) && (!currentKind || currentKind === "supplement");
  };
  const isEvidenceItem = (item: StackItem) => {
    const key = itemKey(item.name);
    const currentKind = currentKindByName.get(key);
    return shoppableNames.has(key) && isEligibleSupplementName(item.name) && (!currentKind || currentKind === "supplement");
  };
  const normalizedForLinks: StackItem[] = cleanedItems
    .filter(isShoppableItem)
    .map((it) => ({ ...it, name: normalizeSupplementName(it.name ?? "") }));
  const enrichedShoppable: StackItem[] = await (async () => {
    try { const r = await enrichAffiliateLinks(normalizedForLinks as any); return asArray(r as any) as StackItem[]; }
    catch (e) { console.warn("enrichAffiliateLinks failed; skipping enrichment.", e); return normalizedForLinks; }
  })();

  const linkedShoppable = applyLinkPolicy(enrichedShoppable, baseClient, mode);
  const linkedByName = new Map(linkedShoppable.map((item) => [itemKey(item.name), item]));
  const clearShoppingLinks = (item: StackItem): StackItem => ({
    ...item,
    link_amazon: null,
    link_fullscript: null,
    link_thorne: null,
    link_other: null,
    link_budget: null,
    link_trusted: null,
    link_clean: null,
    link_default: null,
  });
  const finalStack: StackItem[] = cleanedItems.map((item) =>
    isShoppableItem(item) ? (linkedByName.get(itemKey(item.name)) ?? item) : clearShoppingLinks(item)
  );
  const shoppableSupplementLedger: StackItem[] = finalStack
    .filter(isShoppableItem)
    .sort((a, b) => Number(blueprintShoppableNames.has(itemKey(b.name))) - Number(blueprintShoppableNames.has(itemKey(a.name))));
  const evidenceSupplementLedger: StackItem[] = finalStack
    .filter(isEvidenceItem)
    .sort((a, b) => Number(blueprintShoppableNames.has(itemKey(b.name))) - Number(blueprintShoppableNames.has(itemKey(a.name))));
  const evidenceAlignedItems = evidenceSupplementLedger.map(attachEvidence);
  const evidenceByName = new Map(evidenceAlignedItems.map((item) => [itemKey(item.name), item]));
  const withEvidence: StackItem[] = finalStack.map((item) => evidenceByName.get(itemKey(item.name)) ?? item);
  const persistedItemsByName = new Map<string, StackItem>();
  for (const item of withEvidence) {
    const key = normalizeSupplementName(item.name).toLowerCase();
    const ledgerItem = currentStackLedger.find((current) =>
      normalizeSupplementName(current.name).toLowerCase() === key
    );
    const persistedItem: StackItem = {
      ...item,
      is_current: Boolean(ledgerItem) || item.is_current,
      notes: ledgerItem
        ? `Current ${currentStackKindLabel(ledgerItem.kind).toLowerCase()} reported in intake.${ledgerItem.purpose ? ` Purpose: ${ledgerItem.purpose}` : ""}`
        : item.notes,
    };
    persistedItemsByName.set(key, ledgerItem && ledgerItem.kind !== "supplement" ? clearShoppingLinks(persistedItem) : persistedItem);
  }
  for (const item of currentStackLedger) {
    const key = normalizeSupplementName(item.name).toLowerCase();
    if (!persistedItemsByName.has(key)) {
      persistedItemsByName.set(key, {
        name: item.name,
        dose: item.dose ?? null,
        timing: item.timing ?? null,
        notes: `Current ${currentStackKindLabel(item.kind).toLowerCase()} reported in intake.${item.purpose ? ` Purpose: ${item.purpose}` : ""}`,
        is_current: true,
      });
    }
  }
  const itemsForPersistence = Array.from(persistedItemsByName.values());
  if (/\[object Object\]/i.test(JSON.stringify(itemsForPersistence))) {
    throw new Error("Invalid object string leaked into stack items");
  }
  if (itemsForPersistence.some((item) => {
    const name = validItemName(item.name);
    return !name || isMalformedCurrentStackName(name) || UUID_VALUE_RE.test(name) || OBJECT_STRING_RE.test(name);
  })) {
    throw new Error("Invalid current stack item blocked before persistence");
  }

  // Evidence override
  const { section: evidenceSection } = buildEvidenceSection(evidenceAlignedItems, 8);
  md = overrideEvidenceInMarkdown(md, evidenceSection);

  // Shopping links override
  const shoppingSection = buildShoppingLinksSection(shoppableSupplementLedger);
  const shoppingRe = /## Shopping Links([\s\S]*?)(?=\n## |\n## END|$)/i;
  md = shoppingRe.test(md) ? md.replace(shoppingRe, shoppingSection) : md.replace(/\n## END/i, `\n\n${shoppingSection}\n\n## END`);
  md = complianceSafeLanguage(md);
  const canonicalReport = parseBlueprintReport(md);
  const canonicalIssues = validateBlueprintReport(canonicalReport);
  if (canonicalIssues.length) {
    console.warn("[validation] canonical report issues", canonicalIssues);
    throw new Error(`Refusing to persist invalid canonical report: ${canonicalIssues.join(", ")}`);
  }
  md = canonicalReport.canonicalMarkdown;

  if (/\[object Object\]/i.test(md)) {
    throw new Error("Invalid object string leaked into report");
  }

  const preferenceLeaks = preferenceValuesFound(md);
  const uuidLeaks = md
    .split(/\r?\n/)
    .flatMap((line) => line.split("|"))
    .map((fragment) => fragment.replace(/^[\s>*_`]+|[\s*_`]+$/g, "").trim())
    .filter((fragment) => UUID_VALUE_RE.test(fragment));
  const blueprintEligibilityViolations = blueprintNames(sectionChunk(md, "## Your Blueprint Recommendations"))
    .filter((name) => !isEligibleSupplementName(name));
  const shoppingBody = sectionChunk(md, "## Shopping Links");
  const shoppingEligibilityViolations = currentStackLedger
    .filter((item) => item.kind !== "supplement" || isMedicationOrHormoneName(item.name))
    .filter((item) => shoppingBody.toLowerCase().includes(item.name.toLowerCase()))
    .map((item) => item.name);
  const complianceViolations = Array.from(md.matchAll(new RegExp(FORBIDDEN_COMPLIANCE_RE.source, "gi"))).map((match) => match[0]);
  if (preferenceLeaks.length || uuidLeaks.length || blueprintEligibilityViolations.length || shoppingEligibilityViolations.length || complianceViolations.length) {
    console.warn("[validation] recommendation/shopping eligibility", {
      preferenceLeaks,
      uuidLeaks,
      blueprintEligibilityViolations,
      shoppingEligibilityViolations,
      complianceViolations,
    });
    throw new Error("Report recommendation or shopping eligibility validation failed");
  }

  // ---------- Final validation ----------
  const targets = computeValidationTargets(mode, cap);
  const emptySections = emptyRequiredSections(md);
  const parity = validateCurrentStackParity(md, currentStackLedger);
  const blueprintMix = validateBlueprintMix(md);
  const malformedCurrentRows = malformedCurrentStackRows(md);
  if (!parity.valid) console.warn("[validation] contraindication_current_stack_mismatch", parity.mismatch);
  console.info("[validation] current stack parity", {
    current_stack_rendered_count: currentStackLedger.filter((item) =>
      sectionChunk(md, "## Current Stack").toLowerCase().includes(item.name.toLowerCase())
    ).length,
    contraindication_current_stack_mismatch: parity.mismatch,
  });
  const ok = {
    wordCountOK: wc(md) >= targets.minWords,
    headingsValid: headingsOK(md),
    blueprintValid: blueprintOK(md, targets.minRows),
    blueprintMixValid: blueprintMix.valid,
    citationsValid: citationsOK(md),
    narrativesValid: narrativesOK(md, targets.minSent),
    sectionBodiesValid: emptySections.length === 0,
    currentStackParityValid: parity.valid,
    currentStackNamesValid: malformedCurrentRows.length === 0,
    endValid: !/(^|\n)##\s*END\s*(?=\n|$)/i.test(md),
  };
  if (emptySections.length) {
    console.warn("[validation] empty required section bodies:", emptySections);
  }
  if (!blueprintMix.valid) console.warn("[validation] invalid Blueprint recommendation mix", blueprintMix.counts);
  if (malformedCurrentRows.length) console.warn("[validation] malformed Current Stack rows", malformedCurrentRows);
  console.info("validation.targets", targets);
  console.info("validation.debug", { ...ok, actualWordCount: wc(md) });

  if (!ok.sectionBodiesValid) {
    throw new Error(`Refusing to persist incomplete report sections: ${emptySections.join(", ")}`);
  }
  if (!ok.currentStackParityValid) {
    throw new Error(`Refusing to persist report with Current Stack mismatch: ${parity.mismatch.join(", ")}`);
  }
  if (!ok.blueprintMixValid) {
    throw new Error(`Refusing to persist invalid Blueprint recommendation mix: ${JSON.stringify(blueprintMix.counts)}`);
  }
  if (!ok.currentStackNamesValid) {
    throw new Error(`Refusing to persist malformed Current Stack rows: ${malformedCurrentRows.join(", ")}`);
  }

  // ----------------------------------------------------------------------------
  // Persist parent stack
  // ----------------------------------------------------------------------------
  let parentRows: any[] = [];
  let stackId: string | null = null;
  try {
    const { data, error } = await supabaseAdmin
      .from("stacks")
      .upsert(
        {
          submission_id: id,
          user_id,
          user_email: userEmail,
          tally_submission_id: (sub as any)?.tally_submission_id ?? null,
          version: modelUsed,
          tokens_used: (promptTokens ?? 0) + (completionTokens ?? 0),
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          safety_status: (ok.headingsValid && ok.blueprintValid && ok.blueprintMixValid && ok.citationsValid && ok.sectionBodiesValid && ok.currentStackParityValid && ok.currentStackNamesValid) ? "safe" : "warning",
          summary: md,
          sections: { markdown: md, generated_at: new Date().toISOString(), mode, item_cap: cap ?? null },
          notes: null,
          total_monthly_cost: asArray(withEvidence).reduce((acc, it) => acc + (it?.cost_estimate ?? 0), 0),
        },
        { onConflict: "submission_id" }
      )
      .select();
    if (error) console.error("Supabase upsert error:", error);
    if (data && data.length > 0 && data[0]?.id) { parentRows = data; stackId = String(data[0].id); }
  } catch (err) { console.error("Stacks upsert exception:", err); }

  // ----------------------------------------------------------------------------
  // Persist items (delete → rebuild → insert)
  // ----------------------------------------------------------------------------
  if (parentRows.length > 0 && stackId && user_id) {
    try {
      await supabaseAdmin.from("stacks_items").delete().eq("stack_id", stackId);
      const rows: StackItemRow[] = itemsForPersistence
        .map((it) => {
          const readableName = validItemName(it?.name);
          const safeName = readableName ? validItemName(normalizeSupplementName(readableName)) : null;
          if (!safeName) {
            console.error("🚨 Blocking insert of invalid item", { stack_id: stackId, user_id, rawName: it?.name });
            return null;
          }
          const citations = Array.isArray(it.citations) ? JSON.stringify(it.citations) : null;
          const timingText = (it as any).timing_text ?? it.timing ?? null;
          const bucket = (it as any).timing_bucket ?? classifyTimingBucket(timingText);
          const row: StackItemRow = {
            stack_id: stackId!,
            user_id: user_id!,
            user_email: userEmail,
            name: safeName,
            dose: it.dose ?? null,
            timing: it.timing ?? null,
            notes: it.notes ?? null,
            rationale: it.rationale ?? null,
            caution: it.caution ?? null,
            citations,
            link_amazon: it.link_amazon ?? null,
            link_fullscript: it.link_fullscript ?? null,
            link_thorne: it.link_thorne ?? null,
            link_other: it.link_other ?? null,
            cost_estimate: it.cost_estimate ?? null,
            is_current: Boolean((it as any).is_current ?? false),
            timing_bucket: bucket ?? null,
            timing_text: timingText,
          };
          return row;
        })
        .filter((r): r is StackItemRow => r !== null);
      if (rows.length > 0) {
        const { error } = await supabaseAdmin.from("stacks_items").insert(rows);
        if (error) console.error("⚠️ Failed to insert stacks_items:", error);
        else console.log(`✅ Inserted ${rows.length} stack items for stack ${stackId}`);
      }
    } catch (e) { console.warn("⚠️ stacks_items write failed:", e); }
  }

  const tokens_used = (promptTokens ?? 0) + (completionTokens ?? 0);
  const raw = { stack_id: stackId ?? undefined, mode, item_cap: cap, validation: ok };
  return { markdown: md, raw, model_used: modelUsed, tokens_used, prompt_tokens: promptTokens, completion_tokens: completionTokens };
}

export default generateStackForSubmission;
