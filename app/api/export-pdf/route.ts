// app/api/export-pdf/route.ts
// -----------------------------------------------------------------------------
// GET /api/export-pdf?submission_id=<uuid or tallyId>
// Generates a simple branded PDF for the given stack.
// -----------------------------------------------------------------------------
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const submissionId =
      searchParams.get("submission_id") ||
      searchParams.get("tally_submission_id");

    if (!submissionId) {
      return NextResponse.json(
        { ok: false, error: "submission_id is required" },
        { status: 400 }
      );
    }

    // --- Fetch stack ---
    const { data: stackRow, error: stackErr } = await supabaseAdmin
      .from("stacks")
      .select("*")
      .or(
        `submission_id.eq.${submissionId},tally_submission_id.eq.${submissionId}`
      )
      .maybeSingle();

    if (stackErr) {
      console.error("DB error fetching stack:", stackErr);
      return NextResponse.json(
        { ok: false, error: "DB error fetching stack" },
        { status: 500 }
      );
    }

    if (!stackRow) {
      return NextResponse.json(
        { ok: false, error: "Stack not found" },
        { status: 404 }
      );
    }

    // --- Create PDF ---
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612, 792]); // Letter size
    const { height } = page.getSize();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Header
    page.drawText("LVE360 Blueprint", {
      x: 50,
      y: height - 50,
      size: 22,
      font: fontBold,
      color: rgb(0.02, 0.11, 0.18), // brand.dark
    });

    // Subheader
    page.drawText("Longevity • Vitality • Energy", {
      x: 50,
      y: height - 80,
      size: 12,
      font,
      color: rgb(0.0, 0.76, 0.63), // brand teal
    });

    // Body (Markdown summary fallback)
    const summary = stackRow?.sections?.markdown || stackRow?.summary || "";
    const lines = summary.split("\n").slice(0, 40); // Limit for first pass
    let cursorY = height - 120;
    for (const line of lines) {
      page.drawText(line, {
        x: 50,
        y: cursorY,
        size: 10,
        font,
        color: rgb(0, 0, 0),
      });
      cursorY -= 14;
      if (cursorY < 50) break; // simple cutoff
    }

    // Footer
    page.drawText("© 2025 LVE360 — All Rights Reserved", {
      x: 50,
      y: 30,
      size: 8,
      font,
      color: rgb(0.4, 0.4, 0.4),
    });

    const pdfBytes = await pdfDoc.save();
    const pdfBuffer = Buffer.from(pdfBytes); // ✅ FIX

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "inline; filename=LVE360_Blueprint.pdf",
      },
    });
  } catch (err: any) {
    console.error("PDF export fatal error:", err);
    return NextResponse.json(
      { ok: false, error: String(err?.message ?? err) },
      { status: 500 }
    );
  }
}
