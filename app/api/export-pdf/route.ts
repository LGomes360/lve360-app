// app/api/export-pdf/route.ts
// -----------------------------------------------------------------------------
// GET /api/export-pdf?submission_id=UUID_OR_TALLYID
// Generates a styled PDF (Markdown-based) with branding + static disclaimer.
// -----------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';
export const runtime = 'nodejs';

// Static disclaimer text (matches Results page)
const DISCLAIMER_TEXT = `This plan from LVE360 (Longevity | Vitality | Energy) is for educational purposes only and is not medical advice. It is not intended to diagnose, treat, cure, or prevent any disease. Always consult with your healthcare provider before starting new supplements or making significant lifestyle changes, especially if you are pregnant, nursing, managing a medical condition, or taking prescriptions. Supplements are regulated under the Dietary Supplement Health and Education Act (DSHEA); results vary and no outcomes are guaranteed. If you experience unexpected effects, discontinue use and seek professional care. By using this report, you agree that decisions about your health remain your responsibility and that LVE360 is not liable for how information is applied.`;

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

    // --- Fetch stack row ---
    let query = supabaseAdmin.from("stacks").select("*").limit(1);
    const isUUID = /^[0-9a-f-]{36}$/i.test(submissionId);
    if (isUUID) {
      query = query.eq("submission_id", submissionId);
    } else {
      query = query.eq("tally_submission_id", submissionId);
    }
    const { data: stackRow, error: stackErr } = await query.maybeSingle();

    if (stackErr) {
      console.error("DB error:", stackErr);
      return NextResponse.json({ ok: false, error: "DB error" }, { status: 500 });
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

    let page = pdfDoc.addPage([612, 792]); // Letter
    const margin = 50;
    const lineHeight = 14;
    let cursorY = page.getHeight() - margin;

    function addPage() {
      page = pdfDoc.addPage([612, 792]);
      cursorY = page.getHeight() - margin;
      drawHeader();
    }

    function drawHeader() {
      drawText(
        "LVE360 | Longevity • Vitality • Energy",
        16,
        rgb(0.03, 0.76, 0.63),
        true
      );
      cursorY -= 10;
    }

    function drawText(
      text: string,
      size = 11,
      color = rgb(0, 0, 0),
      bold = false
    ) {
      if (cursorY < margin + size) addPage();
      const f = bold ? boldFont : font;
      page.drawText(text, { x: margin, y: cursorY, size, font: f, color });
      cursorY -= size + 4;
    }

    function drawWrapped(text: string, size = 11, color = rgb(0, 0, 0)) {
      const words = text.split(/\s+/);
      let line = "";
      for (const word of words) {
        const test = line ? line + " " + word : word;
        const width = font.widthOfTextAtSize(test, size);
        if (width > page.getWidth() - margin * 2) {
          drawText(line, size, color);
          line = word;
        } else {
          line = test;
        }
      }
      if (line) drawText(line, size, color);
    }

    // --- Title ---
    drawHeader();

    // --- Content ---
    let content =
      stackRow.sections?.markdown ??
      stackRow.summary ??
      "No report content available.";

    // ✅ Strip guardrail END marker so it never renders
    content = content
      .replace(/^```[a-z]*\n/, "")
      .replace(/```$/, "")
      .replace(/\n?## END\s*$/i, "")
      .trim();

    const lines = content.split("\n");
    for (const line of lines) {
      try {
        if (!line.trim()) {
          cursorY -= lineHeight / 2;
          continue;
        }
        if (line.startsWith("## ")) {
          drawText(line.replace(/^## /, ""), 13, rgb(0.1, 0.2, 0.4), true);
        } else if (line.startsWith("- ")) {
          drawWrapped("• " + line.slice(2), 11);
        } else if (line.includes("|")) {
          if (line.includes("---")) continue; // skip separator row
          const isHeader = /^\|?\s*(rank|supplement|dose|timing|notes)/i.test(
            line
          );
          drawWrapped(line, 9, isHeader ? rgb(0, 0, 0) : rgb(0.2, 0.2, 0.2));
        } else {
          drawWrapped(line, 11);
        }
      } catch (err) {
        console.warn("Parse error on line:", line, err);
      }
    }

    // --- Static Disclaimer (always last page) ---
    cursorY -= 20;
    drawText(
      "Important Wellness Disclaimer",
      12,
      rgb(0.03, 0.76, 0.63),
      true
    );
    DISCLAIMER_TEXT.split(/(?<=\.)\s+/).forEach((sentence) => {
      drawWrapped(sentence.trim(), 10, rgb(0.3, 0.3, 0.3));
    });

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
      { ok: false, error: err.message ?? "Unhandled error" },
      { status: 500 }
    );
  }
}
