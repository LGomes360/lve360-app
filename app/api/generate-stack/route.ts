// app/api/generate-stack/route.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getOpenAiClient } from "../../../src/lib/openai";
import { supabaseAdmin } from "../../../src/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: "Supabase envs not configured." }, { status: 500 });
    }

    let openai;
    try {
      openai = getOpenAiClient();
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 500 });
    }

    const body = await req.json().catch(() => ({}));
    const prompt = body.prompt ?? "Create supplements stack for example user";

    const aiResp = await openai.responses.create({
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      input: prompt,
    });

    // Optionally save to Supabase: await supabaseAdmin.from("stacks").insert([{ aiResp }]);

    return NextResponse.json({ ok: true, ai: aiResp });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 500 });
  }
}
