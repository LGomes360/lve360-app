// -----------------------------------------------------------------------------
// File: app/api/tally-webhook/route.ts
// LVE360 // API Route (2025-09-20 ENHANCED A.5)
// Handles incoming Tally webhook, normalizes/validates data, creates user,
// inserts submission, logs errors, and triggers generate-stack in background.
// -----------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supa } from "@/lib/supabaseAdmin";
import { TALLY_KEYS, NormalizedSubmissionSchema } from "@/types/tally-normalized";
import { parseList, parseSupplements } from "@/lib/parseLists";

// --- Utility helpers ---
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

    // Merge fields + answers for compatibility
    const fieldsMap = body?.data?.fields ? fieldsToMap(body.data.fields) : {};
    const answersMap = body?.form_response?.answers
      ? answersToMap(body.form_response.answers)
      : {};
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
      energy_rating: cleanSingle(
        getByKeyOrLabel(src, TALLY_KEYS.energy_rating, ["energy rating"])
      ),
      sleep_rating: cleanSingle(
        getByKeyOrLabel(src, TALLY_KEYS.sleep_rating, ["sleep rating"])
      ),
      allergies: (() => {
        const flag = String(
          cleanSingle(
            getByKeyOrLabel(src, TALLY_KEYS.allergies_flag, ["allergies"])
          ) ?? ""
        ).toLowerCase();
        const details = getByKeyOrLabel(src, TALLY_KEYS.allergy_details, ["allergy details"]);
        return (flag === "yes" || flag === "true") && details
          ? cleanArray(parseList(details))
          : [];
      })(),
      conditions: cleanArray(
        parseList(getByKeyOrLabel(src, TALLY_KEYS.conditions, ["conditions"]))
      ),
      medications: cleanArray(
        parseList(getByKeyOrLabel(src, TALLY_KEYS.medications, ["medications"]))
      ),
      supplements: parseSupplements(
        getByKeyOrLabel(src, TALLY_KEYS.supplements, ["supplements"])
      ),
      hormones: cleanArray(
        parseList(getByKeyOrLabel(src, TALLY_KEYS.hormones, ["hormones"]))
      ),
      dosing_pref: cleanSingle(
        getByKeyOrLabel(src, TALLY_KEYS.dosing_pref, ["dosing preference"])
      ),
      brand_pref: cleanSingle(
        getByKeyOrLabel(src, TALLY_KEYS.brand_pref, ["brand preference"])
      ),
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
      const { data: userRow } = await supa
        .from("users")
        .select("id")
        .eq("email", normalizedEmail)
        .maybeSingle();
      if (userRow?.id) {
        userId = userRow.id;
      } else {
        const { data: subRow } = await supa
          .from("submissions")
          .select("user_id")
          .eq("user_email", normalizedEmail)
          .order("submitted_at", { ascending: false })
          .limit(1)
          .single();
        const canonicalUserId = subRow?.user_id ?? null;
        const insertPayload: any = {
          email: normalizedEmail,
          tier: "free",
          updated_at: new Date().toISOString(),
        };
        
        if (canonicalUserId) insertPayload.id = canonicalUserId;
        
        const { data: newUser, error: newUserError } = await supa
          .from("users")
          .insert(insertPayload)
          .select("id")
          .single();
        
        if (newUserError) {
          console.error("User creation failed:", newUserError.message);
        } else if (newUser?.id) {
          userId = newUser.id;
        }
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
    const { data: subRow, error: subErr } = await supa
      .from("submissions")
      .insert(submissionRow)
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
// --- STEP: Upsert into goals table so dashboard knows user’s readable goals ---
if (userId && Array.isArray(data.goals)) {
  try {
    // Map raw IDs to readable goal names using the known Tally option map
    const GOAL_MAP: Record<string, string> = {
      "1b2b86fe-b99c-42f0-b4fd-8ff229c4c2f2": "Weight Loss",
      "adc1b868-1c49-4f11-925d-be2d93b67e11": "Improve Sleep",
      "d481337e-be2f-4216-8a76-95e1a96491de": "Build or Maintain Muscle",
      "6a3094ba-a4b1-4fce-9db3-b92b1cf0efe9": "Cognitive Performance",
      "adac2b70-5622-4f50-8e63-8d3dfa05aa8b": "Decrease Inflammation",
      "07b6d212-c844-47f2-96bf-6ea906c933b9": "Longevity",
      "d284f391-71a1-49b0-bddc-467ae8de7cee": "Increase Energy",
      "d1ae4ecf-eb17-4308-93ff-b78bed426f0b": "Better Skin/Nails/Hair",
      "7894b6c9-c199-4108-bb2f-c998c7265164": "Other",
    };

    const readableGoals = data.goals.map(
      (g: string) => GOAL_MAP[g] ?? g
    );

    await supa
      .from("goals")
      .upsert(
        {
          user_id: userId,
          goals: readableGoals,
          custom_goal: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

    console.log("✅ Goals upserted for user:", userId, readableGoals);
  } catch (goalErr: any) {
    console.error("❌ Goals upsert failed:", goalErr.message);
    await supa.from("webhook_failures").insert({
      source: "tally",
      event_type: body?.eventType ?? null,
      event_id: body?.eventId ?? null,
      error_message: `goals_upsert_error: ${goalErr.message}`,
      severity: "warning",
      payload_json: body,
    });
  }
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
