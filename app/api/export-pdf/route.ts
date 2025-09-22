// app/api/export-pdf/route.ts
// -----------------------------------------------------------------------------
// GET /api/export-pdf?submission_id=UUID_OR_TALLYID
// Generates a styled PDF (Markdown-based) with branding + disclaimers.
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

    // --- Build Supabase query (correct order) ---
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
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const page = pdfDoc.addPage([612, 792]); // US Letter
    const { height } = page.getSize();
    const margin = 50;
    let cursorY = height - margin;

    // --- Helpers ---
    const lineHeight = 14;

    function drawText(
      text: string,
      size = 11,
      color = rgb(0, 0, 0),
      bold = false
    ) {
      const f = bold ? boldFont : font;
      page.drawText(text, {
        x: margin,
        y: cursorY,
        size,
        font: f,
        color,
      });
      cursorY -= size + 4;
    }

    function drawWrapped(text: string, size = 11, color = rgb(0, 0, 0)) {
      const words = text.split(/\s+/);
      let line = "";
      for (const word of words) {
        const testLine = line ? line + " " + word : word;
        const width = font.widthOfTextAtSize(testLine, size);
        if (width > page.getWidth() - margin * 2) {
          drawText(line, size, color);
          line = word;
        } else {
          line = testLine;
        }
      }
      if (line) drawText(line, size, color);
    }

    // --- Title ---
    drawText("LVE360 | Longevity • Vitality • Energy", 16, rgb(0.03, 0.76, 0.63), true);
    cursorY -= 10;

    // --- Content ---
    let content =
      stackRow.sections?.markdown ??
      stackRow.summary ??
      "No report content available.";
    content = content.replace(/^```[a-z]*\n/, "").replace(/```$/, "");

    const lines = content.split("\n");
    for (const line of lines) {
      if (!line.trim()) {
        cursorY -= lineHeight / 2;
        continue;
      }
      if (line.startsWith("## ")) {
        drawText(line.replace(/^## /, ""), 13, rgb(0.1, 0.2, 0.4), true);
      } else if (line.startsWith("- ")) {
        drawWrapped("• " + line.slice(2), 11);
      } else if (line.includes("|")) {
        // crude table support: just draw as text for now
        drawWrapped(line, 9);
      } else {
        drawWrapped(line, 11);
      }
    }

    // --- Footer disclaimers ---
    cursorY -= 20;
    drawText("Important Wellness Disclaimers", 12, rgb(0.03, 0.76, 0.63), true);
    drawWrapped("This report is educational and not medical advice.", 10);
    drawWrapped("Supplements are not intended to diagnose, treat, cure, or prevent disease.", 10);
    drawWrapped("Consult your clinician before changes, especially with prescriptions or hormones.", 10);

    // --- Finalize ---
    const pdfBytes = await pdfDoc.save();
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
      { ok: false, error: err.message ?? "Unhandled error generating PDF" },
      { status: 500 }
    );
  }
}
