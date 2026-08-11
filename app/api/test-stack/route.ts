import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { generateStackForSubmission } from "@/lib/generateStack";

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const submissionId = String(body.submissionId ?? body.submission_id ?? "").trim();
    if (!submissionId) {
      return NextResponse.json({ error: "submissionId required" }, { status: 400 });
    }

    const result = await generateStackForSubmission(submissionId, {
      forceRegenerate: true,
      generationReason: "developer-test",
    });

    return NextResponse.json({ ok: true, result });
  } catch (error: any) {
    console.error("[test-stack] generation failed", error);
    return NextResponse.json(
      { ok: false, error: error?.message ?? "generation_failed" },
      { status: 500 },
    );
  }
}
