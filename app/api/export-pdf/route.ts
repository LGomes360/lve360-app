// app/api/export-pdf/route.ts
// -----------------------------------------------------------------------------
// GET /api/export-pdf?submission_id=UUID
// Generates a branded PDF report from a saved stack
// -----------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export const runtime = "nodejs";

// simple word-wrap util for PDF
function wrapText(text: string, maxWidth: number, font: any, size: number) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    const testLine = line ? line + " " + word : word;
    const width = font.widthOfTextAtSize(testLine, size);
    if (width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = testLine;
    }
  }
  if (line) lines.push(line);
  return lines;
}

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
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const titleFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    let page = pdfDoc.addPage([612, 792]); // Letter
    let y = 742; // start below header

    // Header
    page.drawText("LVE360 Blueprint", {
      x: 50,
      y,
      size: 22,
      font: titleFont,
      color: rgb(0.02, 0.11, 0.18),
    });
    y -= 30;
    page.drawText("Longevity | Vitality | Energy", {
      x: 50,
      y,
      size: 14,
      font,
      color: rgb(0.02, 0.11, 0.18),
    });
    y -= 40;

    // Content
    const text =
      stack.sections?.markdown ?? stack.summary ?? "No content available.";
    const paragraphs = text.split(/\n{2,}/);

    const marginX = 50;
    const maxWidth = 612 - 2 * marginX;
    const lineHeight = 14;
    const fontSize = 11;

    for (const para of paragraphs) {
      const lines = wrapText(para, maxWidth, font, fontSize);
      for (const line of lines) {
        if (y < 60) {
          // new page if near bottom
          page = pdfDoc.addPage([612, 792]);
          y = 742;
        }
        page.drawText(line, {
          x: marginX,
          y,
          size: fontSize,
          font,
          color: rgb(0, 0, 0),
        });
        y -= lineHeight;
      }
      y -= lineHeight; // extra space between paragraphs
    }

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
