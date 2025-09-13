import { NextRequest, NextResponse } from "next/server";
import { generateReport } from "@/src/lib/generateReport";

export async function POST(req: NextRequest) {
  try {
    const { submission_id } = await req.json();
    if (!submission_id) {
      return NextResponse.json({ error: "submission_id required" }, { status: 400 });
    }

    const result = await generateReport(submission_id);
    return NextResponse.json(result, { status: 200 });
  } catch (err: any) {
    console.error("generate-report error:", err);
    return NextResponse.json({ error: err.message || "Server error" }, { status: 500 });
  }
}
