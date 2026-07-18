// app/api/export-pdf/route.ts
// GET /api/export-pdf?submission_id=<UUID or Tally short id>
// OR  /api/export-pdf?tally_submission_id=<Tally short id>

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { renderReportPdf } from "@/lib/reportPdf";
import { parseBlueprintReport } from "@/lib/blueprintReport";

function isUUID(id: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

function stripFences(md: string) {
  return md
    .replace(/^```[a-z]*\n/i, "")
    .replace(/```$/, "")
    .replace(/\n?##\s*END\s*$/i, "")
    .trim();
}

const DISCLAIMER_TEXT =
  "This plan from LVE360 (Longevity | Vitality | Energy) is for educational purposes only and is not medical advice. It is not intended to diagnose, treat, cure, or prevent any disease. Always consult with your healthcare provider before starting new supplements or making significant lifestyle changes, especially if you are pregnant, nursing, managing a medical condition, or taking prescriptions. Supplements are regulated under the Dietary Supplement Health and Education Act (DSHEA); results vary and no outcomes are guaranteed. If you experience unexpected effects, discontinue use and seek professional care. By using this report, you agree that decisions about your health remain your responsibility and that LVE360 is not liable for how information is applied.";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const explicitTally = searchParams.get("tally_submission_id");
    const raw = explicitTally ?? searchParams.get("submission_id");

    if (!raw) {
      return NextResponse.json(
        { ok: false, error: "Missing identifier (submission_id or tally_submission_id)" },
        { status: 400 }
      );
    }

    const base = supabaseAdmin.from("stacks").select("*").limit(1);
    const query = explicitTally != null
      ? base.eq("tally_submission_id", explicitTally)
      : isUUID(raw)
        ? base.eq("submission_id", raw)
        : base.eq("tally_submission_id", raw);
    const { data: stackRow, error: stackErr } = await query.maybeSingle();

    if (stackErr) {
      console.error("[EXPORT-PDF] DB error:", stackErr);
      return NextResponse.json({ ok: false, error: "DB error" }, { status: 500 });
    }
    if (!stackRow) {
      return NextResponse.json({ ok: false, error: "Stack not found" }, { status: 404 });
    }

    const content = stripFences(
      (stackRow?.sections?.markdown as string | undefined) ??
      (stackRow?.summary as string | undefined) ??
      "No report content available."
    );
    const pdfBytes = await renderReportPdf(content, DISCLAIMER_TEXT);
    const reportHash = parseBlueprintReport(content).contentHash;

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="LVE360_Blueprint.pdf"',
        "X-LVE360-Report-Hash": reportHash,
      },
    });
  } catch (err: any) {
    console.error("[EXPORT-PDF] Unhandled error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Unhandled error" },
      { status: 500 }
    );
  }
}
