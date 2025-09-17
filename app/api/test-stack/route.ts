// app/api/test-stack/route.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { supabaseAdmin } from "../../../@/lib/supabase";
import { getOpenAiClient } from "../../../src/lib/openai";

export async function POST(req: NextRequest) {
  try {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: "Supabase envs missing." }, { status: 500 });
    }

    let openai;
    try {
      openai = getOpenAiClient();
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 500 });
    }

    // example test logic
    const resp = await openai.responses.create({
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      input: "LVE360 test prompt",
    });

    return NextResponse.json({ ok: true, resp });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 500 });
  }
}
