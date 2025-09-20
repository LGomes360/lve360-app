// -----------------------------------------------------------------------------
// File: app/api/tally-webhook/route.ts
// LVE360 // API Route (2025-09-20 ENHANCED A.5)
// Handles incoming Tally webhook, normalizes/validates data, creates user,
// inserts submission, logs errors, and now triggers generate-stack in background.
// -----------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supa } from "@/lib/supabaseAdmin";
import { TALLY_KEYS, NormalizedSubmissionSchema } from "@/types/tally-normalized";
import { parseList, parseSupplements } from "@/lib/parseLists";

// --- Utility helpers (unchanged) ---
function cleanSingle(val: any): string | undefined { /* ... same as before ... */ }
function cleanArray(val: any): string[] { /* ... same as before ... */ }
function fieldsToMap(fields: any[]): Record<string, unknown> { /* ... same as before ... */ }
function answersToMap(answers: any[]): Record<string, unknown> { /* ... same as before ... */ }
function getByKeyOrLabel(src: Record<string, unknown>, key: string, labelCandidates: string[]) { /* ... same as before ... */ }
function normalize(email: string | null | undefined): string {
  return (email ?? "").toString().trim().toLowerCase();
}

// --- MAIN HANDLER ---
export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();

    // Merge fields + answers for compatibility
    const fieldsMap = body?.data?.fields ? fieldsToMap(body.data.fields) : {};
    const answersMap = body?.form_response?.answers ? answersToMap(body.form_response.answers) : {};
    const src = { ...fieldsMap, ...answersMap };

    // Extract Tally submission id
    const tally_submission_id = body?.data?.submissionId || body?.id || null;

    // Normalize critical fields
    const normalized = {
      user_email: cleanSingle(getByKeyOrLabel(src, TALLY_KEYS.user_email, ["email"])),
      name: cleanSingle(getByKeyOrLabel(src, TALLY_KEYS.name, ["name", "nickname"])),
      dob: cleanSingle(getByKeyOrLabel(src, TALLY_KEYS.dob, ["dob", "date of birth"])),
      height: cleanSingle(getByKeyOrLabel(src, TALLY_KEYS.height, ["height"])),
      weight: (() => {
        const val = getByKeyOrLabel(src, TALLY_KEYS.weight, ["weight"]);
        if (typeof val === "number") return val;
        if (typeof val === "string") return val.replace(/[^0-9.]/g, "");
        return undefined;
      })(),
      sex: cleanSingle(getByKeyOrLabel(src, TALLY_KEYS.sex, ["sex"])),
      gender: cleanSingle(getByKeyOrLabel(src, TALLY_KEYS.gender, ["gender"])),
      pregnant: cleanSingle(getByKeyOrLabel(src, TALLY_KEYS.pregnant, ["pregnant"])),
      goals: cleanArray(parseList(getByKeyOrLabel(src, TALLY_KEYS.goals, ["goals"]))),
      skip_meals: cleanSingle(getByKeyOrLabel(src, TALLY_KEYS.skip_meals, ["skip meals"])),
      energy_rating: cleanSingle(getByKeyOrLabel(src, TALLY_KEYS.energy_rating, ["energy rating"])),
      sleep_rating: cleanSingle(getByKeyOrLabel(src, TALLY_KEYS.sleep_rating, ["sleep rating"])),
      allergies: (() => {
        const flag = String(cleanSingle(getByKeyOrLabel(src, TALLY_KEYS.allergies_flag, ["allergies"])) ?? "").toLowerCase();
        const details = getByKeyOrLabel(src, TALLY_KEYS.allergy_details, ["allergy details"]);
        return (flag === "yes" || flag === "true") && details
          ? cleanArray(parseList(details))
          : [];
      })(),
      conditions: cleanArray(parseList(getByKeyOrLabel(src, TALLY_KEYS.conditions, ["conditions"]))),
      medications: cleanArray(parseList(getByKeyOrLabel(src, TALLY_KEYS.medications, ["medications"]))),
      supplements: parseSupplements(getByKeyOrLabel(src, TALLY_KEYS.supplements, ["supplements"])),
      hormones: cleanArray(parseList(getByKeyOrLabel(src, TALLY_KEYS.hormones, ["hormones"]))),
      dosing_pref: cleanSingle(getByKeyOrLabel(src, TALLY_KEYS.dosing_pref, ["dosing preference"])),
      brand_pref: cleanSingle(getByKeyOrLabel(src, TALLY_KEYS.brand_pref, ["brand preference"])),
    };

    // Validate with Zod schema
    const parsed = NormalizedSubmissionSchema.safeParse(normalized);
    if (!parsed.success) {
      await supa.from("webhook_failures").insert({
        source: "tally",
        event_type: body?.eventType ?? null,
        event_id: body?.eventId ?? null,
        error_message: `validation_error: ${JSON.stringify(parsed.error.flatten())}`,
        severity: "error",
        payload_json: body,
      });
      return NextResponse.json({ ok: false, error: "Validation failed" }, { status: 422 });
    }
    const data = parsed.data;

    // Find or create user
    let userId: string | undefined;
    if (data.user_email) {
      const normalizedEmail = normalize(data.user_email);
      const { data: userRow } = await supa.from("users").select("id").eq("email", normalizedEmail).maybeSingle();
      if (userRow?.id) {
        userId = userRow.id;
      } else {
        const { data: subRow } = await supa.from("submissions").select("user_id").eq("user_email", normalizedEmail).order("submitted_at", { ascending: false }).limit(1).single();
        const canonicalUserId = subRow?.user_id;
        const { data: newUser } = await supa.from("users").insert({
          id: canonicalUserId,
          email: normalizedEmail,
          tier: "free",
          updated_at: new Date().toISOString(),
        }).select("id").single();
        if (newUser?.id) userId = newUser.id;
      }
    }

    // Build submission row
    const { user_email, ...restData } = data;
    const submissionRow = {
      user_id: userId ?? null,
      user_email: user_email ? normalize(user_email) : null,
      tally_submission_id,
      ...restData,
      payload_json: body,
      answers: body?.data?.fields ?? body?.form_response?.answers ?? [],
      updated_at: new Date().toISOString(),
    };

    // Insert submission
    const { data: subRow, error: subErr } = await supa.from("submissions").insert(submissionRow).select("id").single();
    if (subErr || !subRow) {
      await supa.from("webhook_failures").insert({
        source: "tally",
        event_type: body?.eventType ?? null,
        event_id: body?.eventId ?? null,
        error_message: `insert_submission_error: ${subErr?.message}`,
        severity: "critical",
        payload_json: body,
      });
      return NextResponse.json({ ok: false, error: "DB insert failed" }, { status: 500 });
    }

    const submissionId = subRow.id;
    const resultsUrl = `https://app.lve360.com/results?submission_id=${submissionId}`;

    // === NEW: Fire-and-forget stack generation ===
    try {
      fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/generate-stack`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submission_id: submissionId }),
      }).catch((err) => {
        console.error("Background generate-stack call failed:", err);
      });
    } catch (e) {
      console.error("Failed to trigger generate-stack:", e);
    }

    // Respond immediately to Tally
    return NextResponse.json({
      ok: true,
      submission_id: submissionId,
      redirectUrl: resultsUrl,
    });
  } catch (err: any) {
    await supa.from("webhook_failures").insert({
      source: "tally",
      error_message: `fatal_error: ${err?.message ?? String(err)}`,
      severity: "fatal",
      payload_json: null,
    });
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
