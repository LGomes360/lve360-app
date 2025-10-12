export function parseList(val: unknown): string[] {
  if (!val) return [];
  if (Array.isArray(val)) return val.map(String).map((s) => s.trim()).filter(Boolean);
  return String(val)
    .split(/\n|,|;|\|/g)
    .map((s) => s.trim())
    .filter(Boolean);
}
// Add this helper just above parseSupplements (or anywhere above it)
/**
 * Normalize free-form timing strings into canonical enums.
 * Accepts "morning", "evening", "night", "both", "BID", "am/pm" (any case).
 */
function normalizeTiming(raw?: string | null): 'AM' | 'PM' | 'AM/PM' | undefined {
  if (!raw) return undefined;
  const s = String(raw).trim().toLowerCase();
  if (s === 'am' || s.includes('morning')) return 'AM';
  if (s === 'pm' || s.includes('evening') || s.includes('night')) return 'PM';
  if (s === 'am/pm' || s.includes('am pm') || s.includes('both') || s.includes('split') || /\bbid\b/.test(s)) return 'AM/PM';
  return undefined;
}

export function parseSupplements(val: unknown) {
  const lines = parseList(val);
  return lines.map((line) => {
    // Attempt loose parsing: "Name - Brand - Dose - Timing"
    const parts = line.split(/\s*-\s*|\s*\|\s*|,\s*/g).map((s) => s.trim()).filter(Boolean);
    const [name, brand, dose, timingRaw] = parts;
    const timing = normalizeTiming(timingRaw);

    return { name: name ?? line, brand, dose, timing };
  });
}
