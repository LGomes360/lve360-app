// app/api/export-pdf/route.ts
// -----------------------------------------------------------------------------
// GET /api/export-pdf?submission_id=UUID_OR_TALLYID
// Generates a styled, multi-page PDF from a saved stack.
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
        { ok: false, error: "Missing submission_id" },
        { status: 400 }
      );
    }

    // --- Fetch stack ---
    let query = supabaseAdmin.from("stacks").select("*").limit(1);
    const isUUID =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        submissionId
      );

    query = isUUID
      ? query.eq("submission_id", submissionId)
      : query.eq("tally_submission_id", submissionId);

    const { data: stackRow, error: stackErr } = await query.maybeSingle();
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
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const page = pdfDoc.addPage([612, 792]); // US Letter
    const { height, width } = page.getSize();

    let cursorY = height - 50;
    const margin = 50;

    // --- Helper: draw wrapped text ---
    function drawWrappedText(
      text: string,
      size = 12,
      color = rgb(0, 0, 0),
      indent = 0
    ) {
      const words = text.split(/\s+/);
      const lines: string[] = [];
      let currentLine = "";

      for (const word of words) {
        const testLine = currentLine ? currentLine + " " + word : word;
        const lineWidth = font.widthOfTextAtSize(testLine, size);
        if (lineWidth > width - margin * 2 - indent) {
          lines.push(currentLine);
          currentLine = word;
        } else {
          currentLine = testLine;
        }
      }
      if (currentLine) lines.push(currentLine);

      for (const line of lines) {
        if (cursorY < 60) {
          // new page if space runs out
          const newPage = pdfDoc.addPage([612, 792]);
          cursorY = newPage.getSize().height - 50;
        }
        page.drawText(line, {
          x: margin + indent,
          y: cursorY,
          size,
          font,
          color,
        });
        cursorY -= size + 4;
      }
    }

    // --- Title ---
    page.drawText("LVE360 Blueprint", {
      x: margin,
      y: cursorY,
      size: 18,
      font,
      color: rgb(0, 0.6, 0.5), // brand teal
    });
    cursorY -= 30;

    // --- Markdown-aware rendering (basic) ---
    const content =
      stackRow.sections?.markdown ??
      stackRow.summary ??
      "No report content available.";
    const lines = content.split("\n");

    for (const line of lines) {
      if (line.startsWith("## ")) {
        drawWrappedText(line.replace("## ", ""), 14, rgb(0, 0.2, 0.4));
        cursorY -= 6;
      } else if (line.startsWith("- ")) {
        drawWrappedText("• " + line.slice(2), 12, rgb(0, 0, 0), 15);
      } else if (line.startsWith("**") && line.endsWith("**")) {
        drawWrappedText(line.replace(/\*\*/g, ""), 12, rgb(0, 0, 0));
      } else {
        drawWrappedText(line, 12, rgb(0, 0, 0));
      }
      cursorY -= 2;
    }

    const pdfBytes = await pdfDoc.save();

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="LVE360_Blueprint.pdf"',
      },
    });
  } catch (err: any) {
    console.error("Unhandled error in export-pdf:", err);
    return NextResponse.json(
      { ok: false, error: "Unhandled error generating PDF" },
      { status: 500 }
    );
  }
}
