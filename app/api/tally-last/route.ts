// app/api/tally-last/route.ts
// Safe handler for /api/tally-last — does NOT throw during module load.
// - Attempts a configured external fetch if TALLY_API_URL is set, but catches all errors.
// - Otherwise falls back to querying Supabase for last submission.
// - Always returns JSON; never throws at import time.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Adjust this relative path if your central client is located elsewhere:
import { supabaseAdmin } from "../../../src/lib/supabase";

export async function GET(_req: NextRequest) {
  try {
    // Runtime env validation — return helpful JSON if missing
    const tallyUrl = process.env.TALLY_API_URL?.trim();
    if (tallyUrl) {
      // Try the external fetch but guard against network errors
      try {
        const resp = await fetch(tallyUrl, { method: "GET" });
        if (!resp.ok) {
          return NextResponse.json(
            { error: `Tally fetch returned ${resp.status} ${resp.statusText}` },
            { status: 502 }
          );
        }
        const data = await resp.json().catch(() => null);
        return NextResponse.json({ ok: true, source: "tally", data });
      } catch (fetchErr: any) {
        // Do NOT re-throw — return a helpful error so build doesn't fail
        return NextResponse.json(
          { error: `Tally fetch failed: ${String(fetchErr.message ?? fetchErr)}` },
          { status: 502 }
        );
      }
    }

    // Fallback: attempt to read the last submission from Supabase (server-only)
    try {
      const { data, error } = await supabaseAdmin
        .from("submissions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true, source: "supabase", last: data?.[0] ?? null });
    } catch (dbErr: any) {
      return NextResponse.json({ error: `DB fetch failed: ${String(dbErr.message ?? dbErr)}` }, { status: 500 });
    }
  } catch (err: any) {
    // Catch-all (shouldn't normally reach here) — never throw
    return NextResponse.json({ error: String(err?.message ?? err) }, { status: 500 });
  }
}
