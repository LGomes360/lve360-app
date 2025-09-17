// app/api/test-stack/route.ts
// Server route that uses the centralized supabase admin client.
// This version imports the shared client (supabaseAdmin) and
// guards against missing envs at module load time.

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

// Use centralized client. Adjust relative path if your layout differs:
import { supabaseAdmin } from "../../../src/lib/supabase";

/**
 * Helper: ensure supabaseAdmin is available and envs are set.
 * If envs are missing, return a friendly error at runtime instead of throwing during module load.
 */
function getAdminClientOrThrow() {
  // supabaseAdmin creation in src/lib/supabase.ts may have produced a client even with empty strings,
  // but we still verify the envs are present to avoid runtime surprises.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !key) {
    throw new Error("Supabase envs are not configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).");
  }
  return supabaseAdmin;
}

export async function POST(req: NextRequest) {
  try {
    const admin = getAdminClientOrThrow();
    // Example call — replace with your route logic
    const { data, error } = await admin.from("submissions").select("*").limit(1);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, data });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || String(err) }, { status: 500 });
  }
}

// If your route uses GET or other methods, export them similarly.
