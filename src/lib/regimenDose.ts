import type { RoutineItemKind } from "@/lib/routine";

export type RegimenDoseStatus = "taken" | "skipped";
export type RegimenDoseDaypart = "Morning" | "Afternoon" | "Evening";

export type RegimenDoseOccurrence = {
  eventId: string | null;
  regimenItemId: string;
  itemName: string;
  itemKind: RoutineItemKind;
  dose: string | null;
  date: string;
  slotKey: string;
  time: string;
  timeLabel: string;
  status: RegimenDoseStatus | null;
};

export type AsNeededRegimenItem = {
  regimenItemId: string;
  itemName: string;
  itemKind: RoutineItemKind;
  dose: string | null;
};

export type RegimenDoseHistoryItem = {
  eventId: string;
  regimenItemId: string;
  itemName: string;
  itemKind: RoutineItemKind;
  dose: string | null;
  date: string;
  time: string | null;
  status: RegimenDoseStatus;
  recordedAt: string;
};

export type RegimenDoseDay = {
  date: string;
  timeZone: string;
  occurrences: RegimenDoseOccurrence[];
  asNeeded: AsNeededRegimenItem[];
  history: RegimenDoseHistoryItem[];
  scheduleReview: number;
};

export function regimenDoseDaypart(time: string): RegimenDoseDaypart {
  const hour = Number(time.slice(0, 2));
  if (hour < 12) return "Morning";
  if (hour < 17) return "Afternoon";
  return "Evening";
}

export function regimenDoseTimeMinutes(time: string): number {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

export function unrecordedOccurrencesAtOrBefore(
  occurrences: RegimenDoseOccurrence[],
  currentMinutes: number,
): RegimenDoseOccurrence[] {
  return occurrences.filter(
    (occurrence) => !occurrence.status && regimenDoseTimeMinutes(occurrence.time) <= currentMinutes,
  );
}

export function earlierUnrecordedOccurrences(
  occurrences: RegimenDoseOccurrence[],
  currentMinutes: number,
): RegimenDoseOccurrence[] {
  return occurrences.filter(
    (occurrence) => !occurrence.status && regimenDoseTimeMinutes(occurrence.time) < currentMinutes,
  );
}

export function nextUpcomingOccurrence(
  occurrences: RegimenDoseOccurrence[],
  currentMinutes: number,
): RegimenDoseOccurrence | null {
  return occurrences.find(
    (occurrence) => !occurrence.status && regimenDoseTimeMinutes(occurrence.time) >= currentMinutes,
  ) ?? null;
}
