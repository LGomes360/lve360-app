import { NextRequest, NextResponse } from "next/server";

import { isFounderUser } from "@/src/lib/productMode";
import { parseFounderReview } from "@/src/lib/invitationRequest";
import { getSupabaseAdmin } from "@/src/lib/supabaseAdmin";
import { supabaseServer } from "@/src/lib/supabase";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || !isFounderUser(user.id) || !UUID_PATTERN.test(id)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid review." }, { status: 400 });
  }

  const parsed = parseFounderReview(payload);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("access_requests")
    .update({
      status: parsed.status,
      founder_notes: parsed.notes,
      reviewed_at: new Date().toISOString(),
      reviewed_by: user.id,
    })
    .eq("id", id)
    .select("id,status,founder_notes,reviewed_at")
    .maybeSingle();

  if (error) {
    console.error("access request review failed", { id, message: error.message });
    return NextResponse.json({ error: "Review could not be saved." }, { status: 503 });
  }
  if (!data) return NextResponse.json({ error: "Not found." }, { status: 404 });

  return NextResponse.json({ request: data });
}

