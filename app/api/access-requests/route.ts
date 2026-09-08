import { NextRequest, NextResponse } from "next/server";

import { parseInvitationRequest } from "@/src/lib/invitationRequest";
import { getSupabaseAdmin } from "@/src/lib/supabaseAdmin";

const MAX_REQUEST_BYTES = 16_384;
const ACCEPTED_MESSAGE = "Thanks. Your request is on the list for founder review.";

export async function POST(request: NextRequest) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_REQUEST_BYTES) {
    return NextResponse.json({ error: "Please shorten your response and try again." }, { status: 413 });
  }

  let payload: unknown;
  try {
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_REQUEST_BYTES) {
      return NextResponse.json({ error: "Please shorten your response and try again." }, { status: 413 });
    }
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Please check the form and try again." }, { status: 400 });
  }

  const parsed = parseInvitationRequest(payload);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  if (parsed.data.website) {
    return NextResponse.json({ message: ACCEPTED_MESSAGE }, { status: 202 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from("access_requests").upsert(
      {
        email: parsed.data.email,
        first_name: parsed.data.firstName,
        organizing_help: parsed.data.organizingHelp,
        interests: parsed.data.interests,
        request_reason: parsed.data.requestReason ?? null,
        referral_source: parsed.data.referralSource ?? null,
        referral_code: parsed.data.referralCode ?? null,
      },
      { onConflict: "email", ignoreDuplicates: true },
    );

    if (error) throw error;
    return NextResponse.json({ message: ACCEPTED_MESSAGE }, { status: 202 });
  } catch (error) {
    console.error("access request submission failed", {
      message: error instanceof Error ? error.message : "unknown error",
    });
    return NextResponse.json({ error: "Requests are temporarily unavailable. Please try again soon." }, { status: 503 });
  }
}
