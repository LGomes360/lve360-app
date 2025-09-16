// -----------------------------------------------------------------------------
// File: app/api/tally-webhook/route.ts
// LVE360 // API Route (MAXIMAL VERSION)
// Handles incoming Tally form submissions, normalizes + validates data,
// creates (or finds) the user, inserts the submission (with user_id),
// logs all errors to webhook_failures.
// -----------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supa } from "@/lib/supabaseAdmin";
import { TALLY_KEYS, NormalizedSubmissionSchema } from "@/types/tally-normalized";
import { parseList, parseSupplements } from "@/lib/parseLists";

// --- Utility functions ---
function cleanSingle(val: any): string | undefined {
  if (val == null) return undefined;
  if (Array.isArray(val)) return val.length ? cleanSingle(val[0]) : undefined;
  if (typeof val === "object" && "value" in val) return cleanSingle(val.value);
  if (typeof val === "object" && "id" in val) return cleanSingle(val.id);
  if (typeof val === "object" && Object.keys(val).length === 1 && "label" in val)
    return cleanSingle(val.label);
  if (typeof val === "object") return undefined;
  if (typeof val === "boolean") return val ? "yes" : "no";
  return String(val);
}

function cleanArray(val: any): string[] {
  if (val == null) return [];
  if (Array.isArray(val)) return val.map(cleanSingle).filter(Boolean) as string[];
  if (typeof val === "object" && "value" in val) return cleanArray(val.value);
  if (typeof val === "object") return [];
  if (typeof val === "string" && val.trim() !== "") return [val];
  return [];
}

function fieldsToMap(fields: any[]): Record<string, unknown> {
  const map: Record<string, unknown> = {};
  for (const f of fields ?? []) {
    if (!f) continue;
    const key = f.key ?? "";
    let val = f.value ?? f.text ?? f.answer ?? f;
    if (f.type === "CHECKBOXES" && Array.isArray(f.value)) {
      val = f.value.map((v: any) => v?.label ?? v?.value ?? v);
    }
    map[key] = val;
    if (f.label) map[`label::${String(f.label).toLowerCase()}`] = val;
  }
  return map;
}

function answersToMap(answers: any[]): Record<string, unknown> {
  const map: Record<string, unknown> = {};
  for (const a of answers ?? []) {
    const label = a?.field?.label ? String(a.field.label).toLowerCase() : undefined;
    const key = a?.field?.id ?? a?.field?.key;
    let val =
      a?.text ?? a?.email ?? a?.choice?.label ?? a?.choices?.labels ?? a?.value ?? a;
    if (Array.isArray(val)) {
      val = val
        .map((v: any) =>
          typeof v === "string" ? v : v?.label ?? v?.value ?? String(v)
        )
        .filter(Boolean);
    }
    if (key) map[key] = val;
    if (label) map[`label::${label}`] = val;
  }
  return map;
}

function getByKeyOrLabel(
  src: Record<string, unknown>,
  key: string,
  labelCandidates: string[]
): unknown {
  if (key && key in src) return src[key];
  for (const l of labelCandidates) {
    const v = src[`label::${l.toLowerCase()}`];
    if (v !== undefined) return v;
  }
  return undefined;
}

function normalize(email: string | null | undefined): string {
  return (email ?? "").toString().trim().toLowerCase();
}

// --- MAIN HANDLER ---
export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();

    // Merge fields and answers for compatibility (Tally and Typeform)
    const fieldsMap = body?.data?.fields ? fieldsToMap(body.data.fields) : {};
    const answersMap = body?.form_response?.answers
      ? answersToMap(body.form_response.answers)
      : {};
    const src = { ...fieldsMap, ...answersMap };

    // -- Normalize all critical fields --
    const normalized = {
      tally_submission_id: body?.data?.submissionId || body?.id || null,
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

    // --- Validate using Zod schema ---
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

    // --- Find or create user ---
    let userId: string | undefined;
    if (data.user_email) {
      const normalizedEmail = normalize(data.user_email);

      // Try to find user row
      const { data: userRow } = await supa
        .from("users")
        .select("id")
        .eq("email", normalizedEmail)
        .maybeSingle();

      if (userRow?.id) {
        userId = userRow.id;
      } else {
        // Try to find by previous submissions
        const { data: subRow } = await supa
          .from("submissions")
          .select("user_id")
          .eq("user_email", normalizedEmail)
          .order("submitted_at", { ascending: false })
          .limit(1)
          .single();

        const canonicalUserId = subRow?.user_id;

        // Insert user
        const { data: newUser } = await supa
          .from("users")
          .insert({
            id: canonicalUserId,
            email: normalizedEmail,
            tier: "free",
            updated_at: new Date().toISOString(),
          })
          .select("id")
          .single();
        if (newUser?.id) userId = newUser.id;
      }
    }

    // --- Prepare submission row without property duplication ---
    // Remove any conflicting keys from 'data'
    const {
      user_email,                // extracted, not spread
      tally_submission_id,       // extracted, not spread
      ...restData                // everything else
    } = data;

    const insertObj = {
      user_id: userId ?? null,
      user_email: data.user_email ? normalize(data.user_email) : null,
      tally_submission_id: normalized.tally_submission_id ?? null,
      ...restData,
      payload_json: body,
      answers: body?.data?.fields ?? body?.form_response?.answers ?? [],
    };

    // --- Insert submission (including Tally's original ID if present) ---
    const { data: subRow, error: subErr } = await supa
      .from("submissions")
      .insert(insertObj)
      .select("id")
      .single();

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

    // --- (Optional) Send confirmation email, if desired ---
    // You can uncomment and fill in your RESEND API/email code here

    // --- Respond with submission id and redirect URL ---
    return NextResponse.json({
      ok: true,
      submission_id: submissionId,
      redirectUrl: resultsUrl,
    });
  } catch (err: any) {
    // Log fatal error and return 500
    await supa.from("webhook_failures").insert({
      source: "tally",
      error_message: `fatal_error: ${err?.message ?? String(err)}`,
      severity: "fatal",
      payload_json: null,
    });
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
