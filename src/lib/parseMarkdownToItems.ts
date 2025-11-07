/* eslint-disable no-console */

// Central, single-source parser for converting the Markdown report into
// normalized stack items used by the DB/UI.
import { normalizeSupplementName } from "@/lib/evidence";

const TIME_MAP: Record<string, "am" | "pm" | "am_pm"> = {
  am: "am",
  morning: "am",
  breakfast: "am",
  pm: "pm",
  evening: "pm",
  bedtime: "pm",
  night: "pm",
  both: "am_pm",
  split: "am_pm",
};

function inferTimeOfDayFromText(txt: string): "am" | "pm" | "am_pm" | null {
  const s = (txt || "").toLowerCase();
  if (/\b(am|morning|breakfast)\b/.test(s)) return "am";
  if (/\b(pm|evening|bedtime|night)\b/.test(s)) return "pm";
  if (/\b(both|split)\b/.test(s)) return "am_pm";
  return null;
}

export type ParsedItem = {
  name: string;
  rationale?: string | null;
  dose?: string | null;
  timing?: string | null;        // normalized "AM" | "PM" | "AM/PM" or null
  timing_text?: string | null;   // original free-text (e.g., "before meals", "in the evening")
  timing_bucket?: "AM" | "PM" | "AM/PM" | "Anytime" | null;
  is_current?: boolean | null;
  caution?: string | null;
  notes?: string | null;
  citations?: string[] | null;
  // links (may be enriched later)
  link_amazon?: string | null;
  link_fullscript?: string | null;
  link_thorne?: string | null;
  link_other?: string | null;
  cost_estimate?: number | null;
};

// -------------------------- helpers -----------------------------------------

const seeDN = "See Dosing & Notes";

function cleanName(raw: string): string {
  if (!raw) return "";
  return raw
    .replace(/[*_`#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeTiming(raw?: string | null): string | null {
  if (!raw) return null;
  const s = raw.toLowerCase();
  if (/\bam\b|morning|breakfast/.test(s)) return "AM";
  if (/\bpm\b|evening|night|bedtime/.test(s)) return "PM";
  if (/am\/pm|both|split|\bbid\b|twice|2x/.test(s)) return "AM/PM";
  return null;
}

export function classifyTimingBucket(text?: string | null): "AM" | "PM" | "AM/PM" | "Anytime" | null {
  if (!text) return null;
  const s = text.toLowerCase();
  const am = /\b(am|morning|breakfast)\b/.test(s);
  const pm = /\b(pm|evening|night|bedtime)\b/.test(s);
  if (am && pm) return "AM/PM";
  if (/\b(bid|twice|2x|am\/pm|split)\b/.test(s)) return "AM/PM";
  if (am) return "AM";
  if (pm) return "PM";
  if (/\bwith (meal|meals|food)\b/.test(s)) return "Anytime";
  return "Anytime";
}

export function parseDose(dose?: string | null): { amount?: number; unit?: string } {
  if (!dose) return {};
  const cleaned = dose.replace(/[,]/g, " ").replace(/\s+/g, " ");
  const matches = cleaned.match(/(\d+(?:\.\d+)?)/g);
  if (!matches) return {};
  const amount = parseFloat(matches[matches.length - 1]);
  const unitMatch = cleaned.match(/(mcg|μg|ug|mg|g|iu)\b/i);
  const rawUnit = unitMatch ? unitMatch[1] : "";
  let unit = rawUnit ? rawUnit.toLowerCase() : "";
  if (unit === "μg" || unit === "ug") unit = "mcg";
  if (unit === "iu") unit = "IU";
  if (unit === "g") return { amount: amount * 1000, unit: "mg" };
  return { amount, unit: unit || undefined };
}

// -------------------------- core parser --------------------------------------

/**
 * Parse the full Markdown report into a normalized array of items.
 * Pulls from:
 *  - ## Your Blueprint Recommendations (names + rationale)
 *  - ## Current Stack (marks is_current = true)
 *  - ## Dosing & Notes (dose + timing_text + normalized timing)
 */
export function parseMarkdownToItems(md: string): ParsedItem[] {
  const base: Record<string, any> = {};

  // 1) Your Blueprint Recommendations (table -> names + rationale)
// ---- Parse "Your Blueprint Recommendations" table safely ----
const rec = md.match(/## Your Blueprint Recommendations([\s\S]*?)(\n## |$)/i);
if (rec) {
  const tableSection = rec[1] || "";

  // Split lines, keep only table rows starting with "|", and DROP the separator row(s) like:
  // | ---- | ---- | ---- |
  const rows = tableSection
    .split("\n")
    .filter((l) => {
      const t = l.trim();
      // keep actual table rows
      if (!t.startsWith("|")) return false;
      // drop any "all dashes" separator rows (handles any number of columns)
      // matches: | --- | ---- | --- |    (with optional spaces)
      if (/^\|\s*-+(\s*\|\s*-+)*\s*\|?$/.test(t)) return false;
      return true;
    });

  // Expect the first retained row to be the header
  const dataRows = rows.length > 1 ? rows.slice(1) : [];

  dataRows.forEach((row, i) => {
    // Split columns; safe even if there are extra pipes
    const cols = row.split("|").map((c) => c.trim());

    // column 2 is "Supplement" in your table spec: | Rank | Supplement | Why it Matters |
    const nameRaw = (cols[2] || `Item ${i + 1}`).trim();

    // Skip dashed/empty names
    if (!nameRaw || /^-+$/.test(nameRaw)) return;

    // Normalize the supplement to the canonical catalog/evidence key
    const canonical = normalizeSupplementName(nameRaw);

    // column 3 is "Why it Matters"
    const rationale = cols[3] ? String(cols[3]).trim() : null;

    base[canonical.toLowerCase()] = {
      name: canonical,          // store canonical name for downstream systems
      rationale,
      dose: null,
      timing: null,
      timing_text: null,
      is_current: false,
    };
  });
}
  
// Skip junk/placeholder rows so they don't become items
// Derive a name string safely, regardless of upstream variable names.
const nameText =
  (typeof name !== "undefined" && name != null)
    ? String(name).trim()
    : ((typeof cells !== "undefined" && Array.isArray(cells) && cells[0] != null)
        ? String(cells[0]).trim()
        : "");

if (/^\s*(see dosing notes|see dosing|see notes|-|—)\s*$/i.test(nameText)) {
  return null; // or `continue` depending on your loop
}


  // 2) Current Stack (table -> mark is_current=true and copy dose/timing if present)
  const current = md.match(/## Current Stack([\s\S]*?)(\n## |$)/i);
  if (current) {
    const rows = current[1].split("\n").filter((l) => l.trim().startsWith("|"));
    // Expect: | Medication/Supplement | Purpose | Dosage | Timing |
    rows.slice(1).forEach((row, i) => {
      const cols = row.split("|").map((c) => c.trim());
      const name = cleanName(cols[1] || `Current Item ${i + 1}`);
      if (!name) return;
      const purpose = cols[2] || null;
      const dose = cols[3] || null;
      const timingCell = cols[4] || null;

      const timingNorm = normalizeTiming(timingCell);
      const key = name.toLowerCase();

      if (!base[key]) {
        base[key] = {
          name,
          rationale: purpose,
          dose,
          dose_parsed: parseDose(dose),
          timing: timingNorm,
          timing_text: timingCell,
          is_current: true,
        };
      } else {
        base[key].rationale ??= purpose;
        base[key].dose ??= dose;
        base[key].dose_parsed ??= parseDose(dose);
        base[key].timing ??= timingNorm;
        base[key].timing_text ??= timingCell;
        base[key].is_current = true;
      }
    });
  }

  // 3) Dosing & Notes (bulleted list -> robust name+dose+timing_text)
  const dosing = md.match(/## Dosing & Notes([\s\S]*?)(\n## |\n## END|$)/i);
  if (dosing) {
    const lines = dosing[1].split("\n").filter((l) => l.trim().length > 0);

    for (const raw of lines) {
      // Strip "- " or "* "
      const line = raw.replace(/^\s*[-*]\s*/, "");
      // Split only on the FIRST ":" or "—" to keep hyphenated names intact
      const parts = line.split(/[:—]/);
      if (!parts || parts.length < 2) continue;

      const nameRaw = parts.shift()!.trim();
      const rest = parts.join(":").trim(); // keep any internal ":" after the first

      const name = cleanName(nameRaw);
      if (!name) continue;
      
const whenGuess = inferTimeOfDayFromText(`${timing ?? ""} ${notes ?? ""}`);
if (whenGuess) {
  item.time_of_day = whenGuess; // "am" | "pm" | "am_pm"
}

      // Dose candidate: the first sentence-ish chunk
      const firstSentence = rest.split(/[.!?]/)[0]?.trim() || rest;
      const doseCandidate = firstSentence.replace(/\s+/g, " ").replace(/^[–—-]\s*/, "").trim();

      // Timing candidate: anything after the first sentence OR timing-like words inside the dose
      const remainderAfterDose = rest.slice(firstSentence.length).trim();
      const timingCandidate = remainderAfterDose
        ? remainderAfterDose
        : /(?:\bAM\b|\bPM\b|morning|evening|night|bedtime|with (?:meal|meals|food)|twice|2x|BID|split|AM\/PM)/i.test(
            doseCandidate
          )
        ? doseCandidate
        : null;

      const dose = doseCandidate || null;
      const timing_text = timingCandidate || null;
      const timingNorm = normalizeTiming(timing_text);
      const key = name.toLowerCase();

      if (base[key]) {
        base[key].dose = dose;
        base[key].dose_parsed = parseDose(dose);
        base[key].timing = timingNorm;
        base[key].timing_text = timing_text;
      } else {
        base[key] = {
          name,
          rationale: null,
          dose,
          dose_parsed: parseDose(dose),
          timing: timingNorm,
          timing_text,
          is_current: false,
        };
      }
    }
  }

  // Finalize / clean
  const seen = new Set<string>();
  const items: ParsedItem[] = Object.values(base)
    .filter((it: any) => {
      if (!it?.name) return false;
      const key = String(it.name).trim().toLowerCase();
      if (!key || seen.has(key)) return false;
      if (it.name.length > 80) return false;
      if (/^analysis$/i.test(it.name.trim())) return false;
      seen.add(key);
      return true;
    })
    .map((it: any) => {
      const timing_bucket = classifyTimingBucket(it.timing_text ?? it.timing ?? null);
      return {
        name: it.name,
        rationale: it.rationale ?? null,
        dose: it.dose ?? null,
        timing: it.timing ?? null,
        timing_text: it.timing_text ?? null,
        timing_bucket,
        is_current: Boolean(it.is_current ?? false),
        caution: it.caution ?? null,
        notes: it.notes ?? null,
        citations: Array.isArray(it.citations) ? it.citations : null,
        link_amazon: it.link_amazon ?? null,
        link_fullscript: it.link_fullscript ?? null,
        link_thorne: it.link_thorne ?? null,
        link_other: it.link_other ?? null,
        cost_estimate: it.cost_estimate ?? null,
      } as ParsedItem;
    });

  // If the model used "See Dosing & Notes" in tables, ensure timing falls back to AM for sidebar utility
  for (const i of items) {
    if (!i.timing && !i.timing_text && i.dose && i.dose.includes(seeDN)) {
      i.timing = null;
      i.timing_text = null;
      i.timing_bucket = "Anytime";
    }
  }

  return items;
}
function backfillTimingFromNotes(items: any[], markdown: string) {
  const section = (markdown || "").split(/^#+\s*Dosing\s*&\s*Notes\b/im)[1] || markdown;
  for (const it of items) {
    if (it.time_of_day) continue;
    const pat = new RegExp(`\\b${(it.name || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b[^\\n]*`, "i");
    const line = (section.match(pat) || [])[0] || "";
    const guess = inferTimeOfDayFromText(line);
    if (guess) it.time_of_day = guess;
  }
}
backfillTimingFromNotes(items, markdown);

export default parseMarkdownToItems;
