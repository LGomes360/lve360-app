// app/api/export-pdf/route.ts
// -----------------------------------------------------------------------------
// Generates and returns a PDF for a given submission/stack
// Accepts ?submission_id=UUID or ?submission_id=shortTallyId
// -----------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

// Utility: test if string looks like UUID
function isUUID(str: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    str
  );
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    let submissionId = searchParams.get("submission_id");

    if (!submissionId) {
      return NextResponse.json(
        { ok: false, error: "submission_id is required" },
        { status: 400 }
      );
    }

    // Step 1: Resolve short Tally ID → UUID if needed
    if (!isUUID(submissionId)) {
      const { data, error } = await supabaseAdmin
        .from("submissions")
        .select("id")
        .eq("tally_submission_id", submissionId)
        .maybeSingle();

      if (error) {
        return NextResponse.json(
          { ok: false, error: "Failed to resolve tally_submission_id" },
          { status: 500 }
        );
      }

      if (!data) {
        return NextResponse.json(
          { ok: false, error: "No submission found for that tally_submission_id" },
          { status: 404 }
        );
      }

      submissionId = data.id; // swap in the UUID
    }

    // Step 2: Fetch stack by UUID
    const { data: stackRow, error: stackErr } = await supabaseAdmin
      .from("stacks")
      .select("sections, summary, user_email")
      .eq("submission_id", submissionId)
      .maybeSingle();

    if (stackErr) {
      return NextResponse.json(
        { ok: false, error: "Failed to fetch stack" },
        { status: 500 }
      );
    }

    if (!stackRow) {
      return NextResponse.json(
        { ok: false, error: "Stack not found" },
        { status: 404 }
      );
    }

    // Step 3: Generate a simple PDF
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612, 792]); // Letter size
    const { height } = page.getSize();

    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const title = "LVE360 Blueprint";
    page.drawText(title, {
      x: 50,
      y: height - 80,
      size: 20,
      font,
      color: rgb(0.04, 0.11, 0.18), // brand.dark
    });

    // Include some summary text
    const summary =
      stackRow.sections?.markdown ??
      stackRow.summary ??
      "No summary content available.";
    page.drawText(summary.substring(0, 1000), {
      x: 50,
      y: height - 120,
      size: 12,
      font,
      lineHeight: 14,
      maxWidth: 500,
    });

    const pdfBytes = await pdfDoc.save();

    return new NextResponse(pdfBytes, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "inline; filename=LVE360_Blueprint.pdf",
      },
    });
  } catch (err: any) {
    console.error("PDF export failed:", err);
    return NextResponse.json(
      { ok: false, error: "PDF export failed" },
      { status: 500 }
    );
  }
}
