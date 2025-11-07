/* eslint-disable no-console */

// Central, single-source parser for converting the Markdown report into
// normalized stack items used by the DB/UI.

import { normalizeSupplementName } from "@/lib/evidence";

export type ParsedItem = {
  name: string;
  rationale?: string | null;
  dose?: string | null;
  timing?: string | null;        // "AM" | "PM" | "AM/PM" | null
  timing_text?: string | null;   // original free-text
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

const SEE_DN = /^(see dosing & notes|see dosing notes|see dosing|see notes)$/i;

function cleanName(raw: string): string {
  if (!raw) return "";
  return raw.replace(/[*_`#]/g, "").replace(/\s+/g, " ").trim();
}

function normalizeTiming(raw?: string | null): "AM" | "PM" | "AM/PM" | null {
  if (!raw) return null;
  const s = raw.toLowerCase();
  if (/\bam\b|morning|breakfast/.test(s)) return "AM";
  if (/\bpm\b|evening|night|bedtime/.test(s)) return "PM";
  if (/am\/pm|both|split|\bbid\b|twice|2x/.test(s)) return "AM/PM";
  return null;
}

function classifyTimingBucket(text?: string | null): "AM" | "PM" | "AM/PM" | "Anytime" | null {
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

function parseDose(dose?: string | null): { amount?: number; unit?: string } {
  if (!dose) return {};
  const cleaned = dose.replace(/[,]/g, " ").replace(/\s+/g, " ");
  const matches = cleaned.match(/(\d+(?:\.\d+)?)/g);
  if (!matches) return {};
  const amount = parseFloat(matches[matches.length - 1]);
  const unitMatch = cleaned.match(/\b(mcg|μg|ug|mg|g|iu)\b/i);
  const rawUnit = unitMatch ? unitMatch[1] : "";
  let unit = rawUnit ? rawUnit.toLowerCase() : "";
  if (unit === "μg" || unit === "ug") unit = "mcg";
  if (unit === "iu") unit = "IU";
  if (unit === "g") return { amount: amount * 1000, unit: "mg" };
  return { amount, unit: unit || undefined };
}

// Backfill timing if it wasn’t found in a table line by scanning the Dosing & Notes text
function inferTimingFromNotesLine(name: string, notesBlock: string): "AM" | "PM" | "AM/PM" | "Anytime" | null {
  if (!name || !notesBlock) return null;
  const pat = new RegExp(`^\\s*[-*]\\s*${name.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\s*[:—-]\\s*(.+)$`, "im");
  const m = notesBlock.match(pat);
  if (!m) return null;
  const line = m[1] || "";
  const bucket = classifyTimingBucket(line);
  return bucket || null;
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

  // ---------- 1) Your Blueprint Recommendations ----------
  const rec = md.match(/##\s*Your Blueprint Recommendations([\s\S]*?)(\n##\s+|$)/i);
  if (rec) {
    const tableSection = rec[1] || "";
    const rows = tableSection
      .split("\n")
      .map((l) => l.trim())
      .filter((t) => {
        if (!t.startsWith("|")) return false;
        // drop markdown separator rows like | --- | ---- |
        if (/^\|\s*-+(\s*\|\s*-+)*\s*\|?\s*$/.test(t)) return false;
        return true;
      });

    const dataRows = rows.length > 1 ? rows.slice(1) : [];
    dataRows.forEach((row, i) => {
      const cols = row.split("|").map((c) => c.trim());
      // | Rank | Supplement | Why it Matters |
      const rawName = cols[2] || `Item ${i + 1}`;
      const cleaned = cleanName(rawName);
      if (!cleaned || SEE_DN.test(cleaned)) return;

      const canonical = normalizeSupplementName(cleaned);
      const rationale = cols[3] ? String(cols[3]).trim() : null;

      base[canonical.toLowerCase()] = {
        name: canonical,
        rationale,
        dose: null,
        timing: null,
        timing_text: null,
        is_current: false,
      };
    });
  }

  // ---------- 2) Current Stack ----------
  const current = md.match(/##\s*Current Stack([\s\S]*?)(\n##\s+|$)/i);
  if (current) {
    const rows = current[1]
      .split("\n")
      .map((l) => l.trim())
      .filter((t) => t.startsWith("|"));
    // Expect header, then data: | Medication/Supplement | Purpose | Dosage | Timing |
    rows.slice(1).forEach((row, i) => {
      const cols = row.split("|").map((c) => c.trim());
      const raw = cols[1] || `Current Item ${i + 1}`;
      const cleaned = cleanName(raw);
      if (!cleaned || SEE_DN.test(cleaned)) return;

      const canonical = normalizeSupplementName(cleaned);
      const key = canonical.toLowerCase();
      const purpose = cols[2] || null;
      const dose = cols[3] || null;
      const timingCell = cols[4] || null;
      const timingNorm = normalizeTiming(timingCell);

      if (!base[key]) {
        base[key] = {
          name: canonical,
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

  // ---------- 3) Dosing & Notes ----------
  const dosing = md.match(/##\s*Dosing\s*&\s*Notes([\s\S]*?)(\n##\s+|\n##\s*END|$)/i);
  const dosingBlock = dosing ? dosing[1] : "";
  if (dosingBlock) {
    const lines = dosingBlock
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    for (const raw of lines) {
      // Only bullet lines; ignore stray text
      if (!/^\s*[-*]\s+/.test(raw)) continue;

      const line = raw.replace(/^\s*[-*]\s*/, "");
      // Split only on the FIRST ":" or "—"
      const parts = line.split(/[:—-]/);
      if (!parts || parts.length < 2) continue;

      const nameRaw = parts.shift()!.trim();
      const remainder = parts.join(":").trim();

      const cleaned = cleanName(nameRaw);
      if (!cleaned || SEE_DN.test(cleaned)) continue;

      const canonical = normalizeSupplementName(cleaned);
      const firstSentence = (remainder.split(/[.!?]/)[0] || remainder).trim();
      const doseCandidate = firstSentence.replace(/\s+/g, " ").replace(/^[–—-]\s*/, "").trim();

      const remainderAfterDose = remainder.slice(firstSentence.length).trim();
      const hasTimingWords = /(?:\bAM\b|\bPM\b|morning|evening|night|bedtime|with (?:meal|meals|food)|twice|2x|BID|split|AM\/PM)/i.test(
        doseCandidate
      );
      const timingCandidate = remainderAfterDose ? remainderAfterDose : hasTimingWords ? doseCandidate : null;

      const dose = doseCandidate || null;
      const timing_text = timingCandidate || null;
      const timingNorm = normalizeTiming(timing_text);
      const key = canonical.toLowerCase();

      if (base[key]) {
        base[key].dose = base[key].dose ?? dose;
        base[key].dose_parsed = base[key].dose_parsed ?? parseDose(dose);
        base[key].timing = base[key].timing ?? timingNorm;
        base[key].timing_text = base[key].timing_text ?? timing_text;
      } else {
        base[key] = {
          name: canonical,
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

  // ---------- 4) Finalize / clean ----------
  const seen = new Set<string>();
  const items: ParsedItem[] = Object.values(base)
    .filter((it: any) => {
      if (!it?.name) return false;
      const key = String(it.name).trim().toLowerCase();
      if (!key || seen.has(key)) return false;
      if (it.name.length > 80) return false;
      if (/^analysis$/i.test(String(it.name).trim())) return false;
      seen.add(key);
      return true;
    })
    .map((it: any) => {
      // Timing bucket from the best available signal
      let bucket = classifyTimingBucket(it.timing_text ?? it.timing ?? null);
      if (!bucket && dosingBlock) {
        const guess = inferTimingFromNotesLine(it.name, dosingBlock);
        bucket = guess ?? null;
      }
      // If “See Dosing Notes” appears inside dose, default to Anytime bucket
      if (!it.timing && !it.timing_text && typeof it.dose === "string" && /see dosing/i.test(it.dose)) {
        bucket = "Anytime";
      }

      return {
        name: it.name,
        rationale: it.rationale ?? null,
        dose: it.dose ?? null,
        timing: it.timing ?? null,
        timing_text: it.timing_text ?? null,
        timing_bucket: bucket ?? null,
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

  return items;
}

export default parseMarkdownToItems;
