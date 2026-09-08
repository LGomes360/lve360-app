import { NextResponse } from "next/server";

import { isFounderUser } from "@/src/lib/productMode";
import { getSupabaseAdmin } from "@/src/lib/supabaseAdmin";
import { supabaseRoute } from "@/src/lib/supabase";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = supabaseRoute();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isFounderUser(user.id) || !UUID_PATTERN.test(id)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const admin = getSupabaseAdmin();
  const { data, error } = await admin.rpc("revoke_private_invitation", {
    p_invitation_id: id,
    p_founder_id: user.id,
  });
  if (error || data !== true) {
    return NextResponse.json({ error: "Invitation is not active." }, { status: 409 });
  }
  return NextResponse.json({ revoked: true });
}
