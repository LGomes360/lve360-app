// src/lib/timing.ts
export type Bucket = "AM" | "PM" | "OTHER";

export function bucketsForItem(input?: string | null): Bucket[] {
  const raw = (input ?? "").trim().toUpperCase();
  if (!raw) return ["OTHER"];

  // Common patterns
  if (raw === "AM/PM" || raw === "AMPM" || raw === "BID" || raw.includes("TWICE")) return ["AM", "PM"];
  if (raw.includes("AM") || raw.includes("MORNING")) return ["AM"];
  if (raw.includes("PM") || raw.includes("NIGHT") || raw.includes("BED")) return ["PM"];
  return ["OTHER"];
}

export function bucketsFromRecord(r: { timing?: string|null; timing_bucket?: string|null }): Bucket[] {
  return bucketsForItem(r.timing_bucket ?? r.timing);
}
