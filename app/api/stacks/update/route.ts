import { NextResponse } from "next/server";
import { requirePaidApi } from "@/lib/serverEntitlements";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { isMedicationInstructionAuthority, isRegimenInstructionAuthority } from "@/lib/medicationRecord";
import { normalizeRegimenSchedule, regimenScheduleLabel } from "@/lib/regimenSchedule";
import { normalizeHttpsUrl } from "@/lib/supplementProduct";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: Request) {
  try {
    const entitlement = await requirePaidApi();
    if (!entitlement.ok) return entitlement.response;

    const { id, purpose, dose, timing, schedule, active, instructionAuthority, brand, reorderUrl } = await req.json();
    if (!id) return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });

    const admin = getSupabaseAdmin();
    const { data: existing, error: existingError } = await admin
      .from("current_regimen_items")
      .select("id,item_kind,instruction_authority")
      .eq("id", id)
      .eq("user_id", entitlement.user.id)
      .maybeSingle();

    if (existingError) return NextResponse.json({ ok: false, error: existingError.message }, { status: 400 });
    if (!existing) return NextResponse.json({ ok: false, error: "regimen_item_not_found" }, { status: 404 });
    const prescribedItem = existing.item_kind === "medication" || existing.item_kind === "hormone";
    const changesProductDetails = typeof brand !== "undefined" || typeof reorderUrl !== "undefined";
    if (prescribedItem && changesProductDetails) {
      return NextResponse.json({ ok: false, error: "product_details_supplements_only" }, { status: 400 });
    }
    const normalizedBrand = typeof brand === "undefined" ? undefined : String(brand ?? "").trim() || null;
    if (normalizedBrand && normalizedBrand.length > 120) {
      return NextResponse.json({ ok: false, error: "invalid_brand" }, { status: 400 });
    }
    const changesPrescribedInstructions = prescribedItem
      && [purpose, dose, timing, schedule].some((value) => typeof value !== "undefined");
    if (changesPrescribedInstructions && !isMedicationInstructionAuthority(instructionAuthority)) {
      return NextResponse.json(
        { ok: false, error: `${existing.item_kind}_instruction_source_required` },
        { status: 400 },
      );
    }
    const changesSupplementSchedule = !prescribedItem && typeof schedule !== "undefined";
    if (changesSupplementSchedule
      && (!isRegimenInstructionAuthority(instructionAuthority) || instructionAuthority === "medication_label")) {
      return NextResponse.json({ ok: false, error: "supplement_instruction_source_required" }, { status: 400 });
    }
    if (typeof instructionAuthority !== "undefined"
      && !isRegimenInstructionAuthority(instructionAuthority)) {
      return NextResponse.json({ ok: false, error: "invalid_instruction_source" }, { status: 400 });
    }

    const patch: Record<string, unknown> = Object.fromEntries(
      Object.entries({ purpose, dose, timing, active, brand: normalizedBrand })
        .filter(([, value]) => typeof value !== "undefined")
    );
    if (typeof reorderUrl !== "undefined") patch.reorder_url = normalizeHttpsUrl(reorderUrl);
    if (typeof schedule !== "undefined") {
      const normalizedSchedule = schedule === null ? null : normalizeRegimenSchedule(schedule);
      patch.schedule = normalizedSchedule;
      if (normalizedSchedule) patch.timing = regimenScheduleLabel(normalizedSchedule);
    }
    if (!Object.keys(patch).length) {
      return NextResponse.json({ ok: false, error: "no_supported_changes" }, { status: 400 });
    }
    patch.instruction_source = "member_update";
    if (changesPrescribedInstructions || changesSupplementSchedule) patch.instruction_authority = instructionAuthority;
    patch.updated_at = new Date().toISOString();

    const { data, error } = await admin
      .from("current_regimen_items")
      .update(patch)
      .eq("id", id)
      .eq("user_id", entitlement.user.id)
      .select("id")
      .maybeSingle();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    if (!data) return NextResponse.json({ ok: false, error: "regimen_item_not_found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const message = e?.message ?? "unknown_error";
    const invalid = /invalid|required|cadence|time|weekday|interval/.test(message);
    return NextResponse.json({ ok: false, error: message }, { status: invalid ? 400 : 500 });
  }
}
