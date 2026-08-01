import type { RoutineItemKind } from "@/lib/routine";

export type RegimenDoseStatus = "taken" | "skipped";

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
  occurrences: RegimenDoseOccurrence[];
  asNeeded: AsNeededRegimenItem[];
  history: RegimenDoseHistoryItem[];
  scheduleReview: number;
};
