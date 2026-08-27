import { NextResponse } from "next/server";

import { isIanaTimeZone } from "@/lib/accountSettings";
import { getCurrentRegimen } from "@/lib/currentRegimen";
import type { RegimenDoseDay, RegimenDoseHistoryItem, RegimenDoseOccurrence, RegimenDoseStatus } from "@/lib/regimenDose";
import { formatTime, isLocalDate, normalizeRegimenSchedule, regimenDoseSlots } from "@/lib/regimenSchedule";
import { localClock } from "@/lib/reminderSchedule";
import { requirePaidApi } from "@/lib/serverEntitlements";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

type DoseEventRow = {
  id: string;
  regimen_item_id: string;
  scheduled_date: string;
  slot_key: string;
  scheduled_time: string | null;
  status: RegimenDoseStatus;
  recorded_at: string;
};

export async function GET(req: Request) {
  const entitlement = await requirePaidApi();
  if (!entitlement.ok) return entitlement.response;

  try {
    const userId = entitlement.user.id;
    const regimen = await getCurrentRegimen(userId);
    const itemIds = regimen.map((item) => item.id);
    const admin = getSupabaseAdmin();
    const requestedDate = new URL(req.url).searchParams.get("date");
    if (requestedDate && !isLocalDate(requestedDate)) {
      return NextResponse.json({ ok: false, error: "valid_date_required" }, { status: 400 });
    }
    const { data: preferences, error: preferenceError } = await admin
      .from("user_preferences")
      .select("timezone")
      .eq("user_id", userId)
      .maybeSingle();
    if (preferenceError) throw preferenceError;
    const timeZone = isIanaTimeZone(preferences?.timezone) ? preferences.timezone : "UTC";
    const date = requestedDate ?? localClock(new Date(), timeZone).date;
    const historyStart = shiftDate(date, -13);
    let events: DoseEventRow[] = [];

    if (itemIds.length) {
      const { data, error } = await admin
        .from("regimen_dose_events")
        .select("id,regimen_item_id,scheduled_date,slot_key,scheduled_time,status,recorded_at")
        .eq("user_id", userId)
        .gte("scheduled_date", historyStart)
        .lte("scheduled_date", date)
        .in("regimen_item_id", itemIds)
        .order("scheduled_date", { ascending: false })
        .order("recorded_at", { ascending: false });
      if (error) throw error;
      events = (data ?? []) as DoseEventRow[];
    }

    const itemMap = new Map(regimen.map((item) => [item.id, item]));
    const eventMap = new Map(events.map((event) => [eventKey(event.regimen_item_id, event.scheduled_date, event.slot_key), event]));
    const occurrences: RegimenDoseOccurrence[] = [];
    const asNeeded: RegimenDoseDay["asNeeded"] = [];
    let scheduleReview = 0;

    for (const item of regimen) {
      if (!item.schedule) {
        scheduleReview += 1;
        continue;
      }
      const schedule = normalizeRegimenSchedule(item.schedule);
      if (schedule.cadence === "as_needed") {
        asNeeded.push({ regimenItemId: item.id, itemName: item.name, itemKind: item.item_kind, dose: item.dose });
        continue;
      }
      for (const slot of regimenDoseSlots(schedule, date)) {
        const event = eventMap.get(eventKey(item.id, date, slot.slotKey));
        occurrences.push({
          eventId: event?.id ?? null,
          regimenItemId: item.id,
          itemName: item.name,
          itemKind: item.item_kind,
          dose: item.dose,
          date,
          slotKey: slot.slotKey,
          time: slot.time,
          timeLabel: slot.label,
          status: event?.status ?? null,
        });
      }
    }

    occurrences.sort((left, right) => left.time.localeCompare(right.time) || left.itemName.localeCompare(right.itemName));
    asNeeded.sort((left, right) => left.itemName.localeCompare(right.itemName));

    const history: RegimenDoseHistoryItem[] = events.map((event) => {
      const item = itemMap.get(event.regimen_item_id)!;
      return {
        eventId: event.id,
        regimenItemId: event.regimen_item_id,
        itemName: item.name,
        itemKind: item.item_kind,
        dose: item.dose,
        date: event.scheduled_date,
        time: event.scheduled_time ? formatTime(event.scheduled_time.slice(0, 5)) : null,
        status: event.status,
        recordedAt: event.recorded_at,
      };
    });

    return NextResponse.json({ ok: true, day: { date, timeZone, occurrences, asNeeded, history, scheduleReview } satisfies RegimenDoseDay });
  } catch (error) {
    console.error("[routine/doses] load failed", error);
    return NextResponse.json({ ok: false, error: "routine_doses_unavailable" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const entitlement = await requirePaidApi();
  if (!entitlement.ok) return entitlement.response;

  try {
    const input = await req.json().catch(() => null) as Record<string, unknown> | null;
    const regimenItemId = typeof input?.regimen_item_id === "string" ? input.regimen_item_id : null;
    const date = input?.date;
    const slotKey = typeof input?.slot_key === "string" ? input.slot_key : null;
    const status = input?.status;
    if (!regimenItemId || !isLocalDate(date) || !slotKey || (status !== "taken" && status !== "skipped")) {
      return NextResponse.json({ ok: false, error: "valid_dose_record_required" }, { status: 400 });
    }

    const userId = entitlement.user.id;
    const admin = getSupabaseAdmin();
    const { data: item, error: itemError } = await admin
      .from("current_regimen_items")
      .select("id,schedule")
      .eq("id", regimenItemId)
      .eq("user_id", userId)
      .eq("active", true)
      .maybeSingle();
    if (itemError) throw itemError;
    if (!item?.schedule) return NextResponse.json({ ok: false, error: "structured_schedule_required" }, { status: 400 });

    const schedule = normalizeRegimenSchedule(item.schedule);
    let persistedSlot = slotKey;
    let scheduledTime: string | null = null;
    if (schedule.cadence === "as_needed") {
      if (slotKey !== "as_needed" || status !== "taken") {
        return NextResponse.json({ ok: false, error: "invalid_as_needed_record" }, { status: 400 });
      }
      persistedSlot = `as-needed-${crypto.randomUUID()}`;
    } else {
      const expected = regimenDoseSlots(schedule, date).find((slot) => slot.slotKey === slotKey);
      if (!expected) return NextResponse.json({ ok: false, error: "dose_not_scheduled" }, { status: 400 });
      scheduledTime = expected.time;
    }

    const row = {
      user_id: userId,
      regimen_item_id: regimenItemId,
      scheduled_date: date,
      slot_key: persistedSlot,
      scheduled_time: scheduledTime,
      status,
      recorded_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await admin
      .from("regimen_dose_events")
      .upsert(row, { onConflict: "user_id,regimen_item_id,scheduled_date,slot_key" })
      .select("id")
      .single();
    if (error) throw error;
    return NextResponse.json({ ok: true, eventId: data.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "dose_record_failed";
    const invalid = /invalid|required|scheduled|cadence|time|weekday|interval/.test(message);
    return NextResponse.json({ ok: false, error: message }, { status: invalid ? 400 : 500 });
  }
}

export async function DELETE(req: Request) {
  const entitlement = await requirePaidApi();
  if (!entitlement.ok) return entitlement.response;

  try {
    const input = await req.json().catch(() => null) as Record<string, unknown> | null;
    const eventId = typeof input?.event_id === "string" ? input.event_id : null;
    if (!eventId) return NextResponse.json({ ok: false, error: "event_id_required" }, { status: 400 });
    const { data, error } = await getSupabaseAdmin()
      .from("regimen_dose_events")
      .delete()
      .eq("id", eventId)
      .eq("user_id", entitlement.user.id)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ ok: false, error: "dose_event_not_found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "dose_undo_failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

function eventKey(itemId: string, date: string, slotKey: string): string {
  return `${itemId}:${date}:${slotKey}`;
}

function shiftDate(value: string, days: number): string {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}
