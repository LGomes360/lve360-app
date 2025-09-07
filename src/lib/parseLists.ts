export function parseList(val: unknown): string[] {
  if (!val) return [];
  if (Array.isArray(val)) return val.map(String).map((s) => s.trim()).filter(Boolean);
  return String(val)
    .split(/\n|,|;|\|/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function parseSupplements(val: unknown) {
  const lines = parseList(val);
  return lines.map((line) => {
    // Attempt loose parsing: "Name - Brand - Dose - Timing"
    const parts = line.split(/\s*-\s*|\s*\|\s*|,\s*/g).map((s) => s.trim()).filter(Boolean);
    const [name, brand, dose, timingRaw] = parts;
    const timing = timingRaw && ['AM','PM','AM/PM'].includes(timingRaw) ? (timingRaw as 'AM'|'PM'|'AM/PM') : undefined;
    return { name: name ?? line, brand, dose, timing };
  });
}
