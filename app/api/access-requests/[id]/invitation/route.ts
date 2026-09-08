import { NextRequest, NextResponse } from "next/server";

import { createInvitationToken, hashInvitationToken } from "@/src/lib/invitationTokens";
import { getProductMode, isFounderUser } from "@/src/lib/productMode";
import { getSupabaseAdmin } from "@/src/lib/supabaseAdmin";
import { supabaseServer } from "@/src/lib/supabase";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || !isFounderUser(user.id) || !UUID_PATTERN.test(id)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  if (!getProductMode().invitationsOperationallyUnlocked) {
    return NextResponse.json({ error: "The founder GO gate is locked." }, { status: 423 });
  }

  const token = createInvitationToken();
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.rpc("issue_private_invitation", {
    p_request_id: id,
    p_token_hash: hashInvitationToken(token),
    p_founder_id: user.id,
  });

  const invitation = Array.isArray(data) ? data[0] : null;
  if (error || !invitation) {
    console.error("invitation issuance failed", { requestId: id, message: error?.message ?? "no result" });
    return NextResponse.json({ error: "Invitation could not be issued." }, { status: 409 });
  }

  const invitationUrl = new URL(`/invite/${token}`, request.nextUrl.origin).toString();
  return NextResponse.json({
    invitation: {
      id: invitation.invitation_id,
      email: invitation.invite_email,
      expiresAt: invitation.invite_expires_at,
      url: invitationUrl,
    },
  });
}
