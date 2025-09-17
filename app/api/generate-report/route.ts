// app/api/generate-report/route.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getOpenAiClient } from "../../../src/lib/openai";
import { supabaseAdmin } from "../../../@/lib/supabase";

/**
 * POST /api/generate-report
 * - Lazy-instantiates OpenAI at request time.
 * - Returns helpful JSON errors if envs are missing or if the call fails.
 */
export async function POST(req: NextRequest) {
  try {
    // runtime checks
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { error: "Supabase env vars missing (NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY)." },
        { status: 500 }
      );
    }

    let openai;
    try {
      openai = getOpenAiClient();
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 500 });
    }

    const body = await req.json().catch(() => ({}));
    const prompt = body.prompt ?? "Generate LVE360 report (test)";

    const resp = await openai.responses.create({
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      input: prompt,
    });

    // Example: optionally persist to Supabase
    // await supabaseAdmin.from("reports").insert([{ response: resp }]);

    return NextResponse.json({ ok: true, result: resp });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 500 });
  }
}
