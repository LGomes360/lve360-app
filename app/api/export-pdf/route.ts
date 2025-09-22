// app/api/export-pdf/route.ts
// -----------------------------------------------------------------------------
// GET /api/export-pdf?submission_id=UUID_OR_TALLYID
// Generates a styled, branded multi-page PDF with logo, tables, and disclaimers.
// -----------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import fs from "fs";
import path from "path";

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

    // --- Detect UUID vs short Tally ID ---
    const isUUID =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        submissionId
      );

    // --- Fetch stack row ---
    const { data: stackRow, error: stackErr } = await supabaseAdmin
      .from("stacks")
      .select("*")
      .eq(isUUID ? "submission_id" : "tally_submission_id", submissionId)
      .maybeSingle();

    if (stackErr) {
      console.error("Supabase error:", stackErr);
      return NextResponse.json(
        { ok: false, error: stackErr.message },
        { status: 500 }
      );
    }

    if (!stackRow) {
      return NextResponse.json(
        { ok: false, error: `Stack not found for ID ${submissionId}` },
        { status: 404 }
      );
    }

    // --- PDF setup ---
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Try loading logo
    let logoImage: any = null;
    try {
      const logoPath = path.resolve("./public/logo.png");
      if (fs.existsSync(logoPath)) {
        const logoBytes = fs.readFileSync(logoPath);
        logoImage = await pdfDoc.embedPng(logoBytes);
      }
    } catch (e) {
      console.warn("⚠️ Logo not found or failed to load. Continuing without logo.");
    }

    let currentPage = pdfDoc.addPage([612, 792]); // US Letter
    let cursorY = currentPage.getSize().height - 90;
    const marginX = 50;
    const lineHeight = 14;

    function ensureSpace(required: number) {
      if (cursorY - required < 72) {
        currentPage = pdfDoc.addPage([612, 792]);
        drawHeader(currentPage);
        cursorY = currentPage.getSize().height - 90;
      }
    }

    function drawWrapped(
      text: string,
      size = 11,
      color = rgb(0, 0, 0),
      indent = 0,
      useBold = false
    ) {
      const f = useBold ? boldFont : font;
      const words = text.split(/\s+/);
      let line = "";
      for (const word of words) {
        const testLine = line ? line + " " + word : word;
        const w = f.widthOfTextAtSize(testLine, size);
        if (w > currentPage.getSize().width - 2 * marginX - indent) {
          ensureSpace(lineHeight);
          currentPage.drawText(line, {
            x: marginX + indent,
            y: cursorY,
            size,
            font: f,
            color,
          });
          cursorY -= lineHeight;
          line = word;
        } else {
          line = testLine;
        }
      }
      if (line) {
        ensureSpace(lineHeight);
        currentPage.drawText(line, {
          x: marginX + indent,
          y: cursorY,
          size,
          font: f,
          color,
        });
        cursorY -= lineHeight;
      }
    }

    function drawTable(tableLines: string[]) {
      if (tableLines.length < 2) return;
      const rows = tableLines
        .map((line) =>
          line
            .split("|")
            .map((c) => c.trim())
            .filter(Boolean)
        )
        .filter((r) => r.length > 0);

      const colCount = rows[0].length;
      const colWidth =
        (currentPage.getSize().width - 2 * marginX) / Math.max(1, colCount);
      const rowHeight = 18;

      rows.forEach((row, i) => {
        ensureSpace(rowHeight + 6);
        const isHeader = i === 0;
        const bgColor = isHeader
          ? rgb(0.03, 0.76, 0.63) // teal
          : i % 2 === 0
          ? rgb(0.95, 0.95, 0.95) // zebra
          : rgb(1, 1, 1);

        row.forEach((cell, j) => {
          const x = marginX + j * colWidth;
          currentPage.drawRectangle({
            x,
            y: cursorY - rowHeight,
            width: colWidth,
            height: rowHeight,
            color: bgColor,
          });
          currentPage.drawText(cell, {
            x: x + 4,
            y: cursorY - rowHeight + 5,
            size: 9,
            font: isHeader ? boldFont : font,
            color: isHeader ? rgb(1, 1, 1) : rgb(0, 0, 0),
            maxWidth: colWidth - 8,
          });
        });
        cursorY -= rowHeight;
      });

      cursorY -= 8;
    }

    function drawHeader(page: any) {
      const { width, height } = page.getSize();
      if (logoImage) {
        const logoDims = logoImage.scale(0.15);
        page.drawImage(logoImage, {
          x: marginX,
          y: height - logoDims.height - 40,
          width: logoDims.width,
          height: logoDims.height,
        });
        page.drawText("LVE360 | Longevity | Vitality | Energy", {
          x: marginX + logoDims.width + 10,
          y: height - 60,
          size: 16,
          font: boldFont,
          color: rgb(0.03, 0.76, 0.63),
        });
      } else {
        page.drawText("LVE360 | Longevity | Vitality | Energy", {
          x: marginX,
          y: height - 60,
          size: 16,
          font: boldFont,
          color: rgb(0.03, 0.76, 0.63),
        });
      }
    }

    // --- Render first page header ---
    drawHeader(currentPage);

    // --- Render content ---
    let content =
      stackRow.sections?.markdown ??
      stackRow.summary ??
      "No report content available.";
    content = content.replace(/^```[a-z]*\n/, "").replace(/```$/, "");

    const lines = content.split("\n");
    let buffer: string[] = [];

    for (const line of lines) {
      if (line.startsWith("## ")) {
        if (buffer.length) {
          drawTable(buffer);
          buffer = [];
        }
        cursorY -= 10;
        drawWrapped(line.replace(/^## /, ""), 14, rgb(0.1, 0.2, 0.4), 0, true);
        cursorY -= 6;
      } else if (line.includes("|")) {
        buffer.push(line);
      } else {
        if (buffer.length) {
          drawTable(buffer);
          buffer = [];
        }
        if (line.startsWith("- ")) {
          drawWrapped("• " + line.slice(2), 11, rgb(0, 0, 0), 15);
        } else {
          drawWrapped(line, 11);
        }
      }
    }
    if (buffer.length) drawTable(buffer);

    // --- Footer disclaimers ---
    ensureSpace(80);
    drawWrapped("Important Wellness Disclaimers", 12, rgb(0.03, 0.76, 0.63), 0, true);
    drawWrapped("This report is educational and not medical advice.", 10);
    drawWrapped("Supplements are not intended to diagnose, treat, cure, or prevent disease.", 10);
    drawWrapped("Consult your clinician before changes, especially with prescriptions or hormones.", 10);

    // --- Return PDF ---
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
