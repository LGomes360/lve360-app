// app/api/generate-report/route.ts
import { NextRequest, NextResponse } from "next/server";
import { generateReport } from "@/src/lib/generateReport";
import { supabaseAdmin } from "@/src/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const { submission_id, email } = await req.json();

    if (!submission_id && !email) {
      return NextResponse.json(
        { error: "Provide submission_id or email" },
        { status: 400 }
      );
    }

    // Optional: ensure user is premium (gate on server)
    // const { data: userTier } = await supabaseAdmin
    //   .from("users")
    //   .select("tier")
    //   .eq("email", email)
    //   .single();
    // if (userTier?.tier !== "premium") {
    //   return NextResponse.json({ error: "Premium required" }, { status: 402 });
    // }

    const key = submission_id || email;
    const result = await generateReport(key);

    return NextResponse.json(
      { ok: true, saved: result.saved, report_id: result.id, body: result.body },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("generate-report error:", err);
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 }
    );
  }
}
