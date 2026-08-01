import { NextResponse } from "next/server";
import { requirePaidApi } from "@/lib/serverEntitlements";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { isMedicationInstructionAuthority } from "@/lib/medicationRecord";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: Request) {
  try {
    const entitlement = await requirePaidApi();
    if (!entitlement.ok) return entitlement.response;

    const { id, purpose, dose, timing, active, instructionAuthority } = await req.json();
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
    if (typeof dose !== "undefined" && existing.item_kind === "hormone") {
      return NextResponse.json(
        { ok: false, error: "dose_updates_unavailable_for_hormones" },
        { status: 400 },
      );
    }
    const changesMedicationInstructions = existing.item_kind === "medication"
      && [purpose, dose, timing].some((value) => typeof value !== "undefined");
    if (changesMedicationInstructions && !isMedicationInstructionAuthority(instructionAuthority)) {
      return NextResponse.json(
        { ok: false, error: "medication_instruction_source_required" },
        { status: 400 },
      );
    }
    if (typeof instructionAuthority !== "undefined" && existing.item_kind !== "medication") {
      return NextResponse.json({ ok: false, error: "instruction_source_not_supported" }, { status: 400 });
    }

    const patch: Record<string, unknown> = Object.fromEntries(
      Object.entries({ purpose, dose, timing, active })
        .filter(([, value]) => typeof value !== "undefined")
    );
    if (!Object.keys(patch).length) {
      return NextResponse.json({ ok: false, error: "no_supported_changes" }, { status: 400 });
    }
    patch.instruction_source = "member_update";
    if (changesMedicationInstructions) patch.instruction_authority = instructionAuthority;
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
    return NextResponse.json({ ok: false, error: e?.message ?? "unknown_error" }, { status: 500 });
  }
}
