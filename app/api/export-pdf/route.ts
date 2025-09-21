// app/api/export-pdf/route.ts
// -----------------------------------------------------------------------------
// GET /api/export-pdf?submission_id=UUID_OR_TALLYID
// Generates a styled, multi-page PDF from a saved stack.
// ----------------------------------------------------------------------------- 

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const submissionId = searchParams.get("submission_id");

    if (!submissionId) {
      return NextResponse.json({ ok: false, error: "Missing submission_id" }, { status: 400 });
    }

    // --- Fetch stack row ---
    let query = supabaseAdmin.from("stacks").select("*").limit(1);
    const isUUID =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(submissionId);

    query = isUUID ? query.eq("submission_id", submissionId) : query.eq("tally_submission_id", submissionId);
    const { data: stackRow, error: stackErr } = await query.maybeSingle();
    if (stackErr) throw new Error("DB error fetching stack");
    if (!stackRow) return NextResponse.json({ ok: false, error: "Stack not found" }, { status: 404 });

    // --- Create PDF ---
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

    let currentPage = pdfDoc.addPage([612, 792]); // US Letter
    let cursorY = currentPage.getSize().height - 72; // 1" top margin
    const marginX = 50;
    const lineHeight = 14;

    function ensureSpace(required: number) {
      if (cursorY - required < 72) {
        currentPage = pdfDoc.addPage([612, 792]);
        cursorY = currentPage.getSize().height - 72;
      }
    }

    function drawWrapped(text: string, size = 12, color = rgb(0, 0, 0), indent = 0) {
      const words = text.split(/\s+/);
      let line = "";
      for (const word of words) {
        const testLine = line ? line + " " + word : word;
        const w = font.widthOfTextAtSize(testLine, size);
        if (w > currentPage.getSize().width - 2 * marginX - indent) {
          ensureSpace(lineHeight);
          currentPage.drawText(line, { x: marginX + indent, y: cursorY, size, font, color });
          cursorY -= lineHeight;
          line = word;
        } else {
          line = testLine;
        }
      }
      if (line) {
        ensureSpace(lineHeight);
        currentPage.drawText(line, { x: marginX + indent, y: cursorY, size, font, color });
        cursorY -= lineHeight;
      }
    }

    // --- Title ---
    drawWrapped("LVE360 | Longevity | Vitality | Energy", 16, rgb(0.03, 0.76, 0.63));
    cursorY -= 12;

    // --- Prepare & sanitize content ---
    let content =
      stackRow.sections?.markdown ??
      stackRow.summary ??
      "No report content available.";

    // Strip triple backtick fences (```markdown ... ```)
    content = content.replace(/^```[a-z]*\n/, "").replace(/```$/, "");

    // --- Render content ---
    const lines = content.split("\n");
    for (const line of lines) {
      if (!line.trim()) {
        cursorY -= lineHeight / 2;
        continue;
      }
      if (line.startsWith("## ")) {
        cursorY -= 6;
        drawWrapped(line.replace(/^## /, ""), 14, rgb(0.1, 0.2, 0.4));
        cursorY -= 6;
      } else if (line.startsWith("- ")) {
        drawWrapped("• " + line.slice(2), 11, rgb(0, 0, 0), 15);
      } else if (/^\*\*(.+)\*\*$/.test(line)) {
        drawWrapped(line.replace(/\*\*/g, ""), 12, rgb(0, 0, 0));
      } else {
        drawWrapped(line, 11, rgb(0, 0, 0));
      }
    }

    // --- Footer disclaimer ---
    ensureSpace(60);
    drawWrapped("Important Wellness Disclaimers", 12, rgb(0.03, 0.76, 0.63));
    drawWrapped("This report is educational and not medical advice.", 10);
    drawWrapped("Supplements are not intended to diagnose, treat, cure, or prevent disease.", 10);
    drawWrapped("Consult your clinician before changes, especially with prescriptions or hormones.", 10);

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
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
