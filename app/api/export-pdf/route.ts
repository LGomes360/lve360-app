// app/api/export-pdf/route.ts
// -----------------------------------------------------------------------------
// GET /api/export-pdf?submission_id=UUID
// Generates a simple branded PDF report from a saved stack
// -----------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const submissionId = searchParams.get("submission_id");

    if (!submissionId) {
      return NextResponse.json(
        { ok: false, error: "submission_id required" },
        { status: 400 }
      );
    }

    // --- Fetch stack from DB ---
    const { data: stack, error } = await supabaseAdmin
      .from("stacks")
      .select("sections, summary, user_email")
      .eq("submission_id", submissionId)
      .maybeSingle();

    if (error || !stack) {
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
    const titleFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Header
    page.drawText("LVE360 Blueprint", {
      x: 50,
      y: height - 80,
      size: 24,
      font: titleFont,
      color: rgb(0.02, 0.11, 0.18), // brand.dark
    });

    page.drawText("Longevity | Vitality | Energy", {
      x: 50,
      y: height - 110,
      size: 14,
      font,
      color: rgb(0.02, 0.11, 0.18),
    });

    // Content
    const text = stack.sections?.markdown ?? stack.summary ?? "No content available.";
    const wrapped = text.split("\n").slice(0, 50).join("\n"); // keep it short for now

    page.drawText(wrapped, {
      x: 50,
      y: height - 150,
      size: 11,
      font,
      color: rgb(0, 0, 0),
      lineHeight: 14,
    });

    // --- Save PDF ---
    const pdfBytes = await pdfDoc.save();
    const pdfBuffer = Buffer.from(pdfBytes);

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "inline; filename=LVE360_Blueprint.pdf",
      },
    });
  } catch (err: any) {
    console.error("Export PDF error:", err);
    return NextResponse.json(
      { ok: false, error: String(err?.message ?? err) },
      { status: 500 }
    );
  }
}
