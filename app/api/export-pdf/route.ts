// app/api/export-pdf/route.ts
// -----------------------------------------------------------------------------
// GET /api/export-pdf?submission_id=UUID_OR_TALLYID
// Generates a simple PDF from a saved stack (Markdown + summary).
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

    // --- Fetch stack with conditional query ---
    let query = supabaseAdmin.from("stacks").select("*").limit(1);

    const isUUID =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        submissionId
      );

    if (isUUID) {
      query = query.eq("submission_id", submissionId);
    } else {
      query = query.eq("tally_submission_id", submissionId);
    }

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
    const { height } = page.getSize();

    const fontSize = 12;
    const margin = 50;

    // --- Helper: wrap text ---
    function drawWrappedText(text: string, yStart: number) {
      const words = text.split(/\s+/);
      const lines: string[] = [];
      let currentLine = "";

      for (const word of words) {
        const testLine = currentLine ? currentLine + " " + word : word;
        const width = font.widthOfTextAtSize(testLine, fontSize);
        if (width > page.getWidth() - margin * 2) {
          lines.push(currentLine);
          currentLine = word;
        } else {
          currentLine = testLine;
        }
      }
      if (currentLine) lines.push(currentLine);

      let y = yStart;
      for (const line of lines) {
        page.drawText(line, {
          x: margin,
          y,
          size: fontSize,
          font,
          color: rgb(0, 0, 0),
        });
        y -= fontSize + 4;
      }
      return y;
    }

    // --- Document Content ---
    let cursorY = height - margin;
    page.drawText("LVE360 Blueprint", {
      x: margin,
      y: cursorY,
      size: 18,
      font,
      color: rgb(0, 0.6, 0.5),
    });
    cursorY -= 30;

    cursorY = drawWrappedText(
      stackRow.sections?.markdown ??
        stackRow.summary ??
        "No report content available.",
      cursorY
    );

    const pdfBytes = await pdfDoc.save();

    // --- Return PDF Response ---
    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="LVE360_Blueprint.pdf"`,
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
