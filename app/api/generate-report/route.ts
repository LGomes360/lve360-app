// app/api/generate-report/route.ts

import { NextRequest, NextResponse } from "next/server";
import { generateReport } from "@/lib/generateReport";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Accept either submission_id or email
    const submissionIdOrEmail: string | undefined =
      body?.submission_id ?? body?.email;

    if (!submissionIdOrEmail) {
      return NextResponse.json(
        { error: "Missing submission_id or email" },
        { status: 400 }
      );
    }

    const result = await generateReport(submissionIdOrEmail);

    return NextResponse.json(result, { status: 200 });
  } catch (err: any) {
    console.error("❌ Error in /api/generate-report:", err);
    return NextResponse.json(
      { error: "Failed to generate report", details: err?.message ?? err },
      { status: 500 }
    );
  }
}
