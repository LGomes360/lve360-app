// app/api/export-pdf/route.ts
// -----------------------------------------------------------------------------
// GET /api/export-pdf?submission_id=<uuid or tally_short>
// Generates a branded PDF of the LVE360 Blueprint and streams it to the client.
// -----------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export const runtime = "nodejs"; // ✅ force server runtime

export async function GET(req: NextRequest) {
  try {
    const submissionId =
      req.nextUrl.searchParams.get("submission_id") ?? null;
    if (!submissionId) {
      return NextResponse.json(
        { ok: false, error: "submission_id is required" },
        { status: 400 }
      );
    }

    // --- Fetch stack row
    const { data, error } = await supabaseAdmin
      .from("stacks")
      .select("id, user_email, sections")
      .eq("submission_id", submissionId)
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json(
        { ok: false, error: "No stack found" },
        { status: 404 }
      );
    }

    const markdown = data.sections?.markdown ?? "No content available.";

    // --- Create PDF
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612, 792]); // Letter size
    const { height } = page.getSize();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const titleFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Header
    page.drawText("LVE360 Blueprint", {
      x: 50,
      y: height - 60,
      size: 24,
      font: titleFont,
      color: rgb(0.02, 0.11, 0.18), // brand.dark
    });

    // Sub-header
    page.drawText("Longevity • Vitality • Energy", {
      x: 50,
      y: height - 90,
      size: 14,
      font,
      color: rgb(0.02, 0.11, 0.18),
    });

    // Body text (truncated to fit one page for MVP)
    const safeText = markdown.replace(/[#*_`>-]/g, ""); // strip md syntax
    const wrapped = wrapText(safeText, 80);
    page.drawText(wrapped.slice(0, 40).join("\n"), {
      x: 50,
      y: height - 130,
      size: 11,
      font,
      color: rgb(0.02, 0.11, 0.18),
      lineHeight: 14,
    });

    const pdfBytes = await pdfDoc.save();

    return new NextResponse(pdfBytes, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="LVE360_Blueprint.pdf"`,
      },
    });
  } catch (err: any) {
    console.error("Export PDF failed:", err);
    return NextResponse.json(
      { ok: false, error: String(err?.message ?? err) },
      { status: 500 }
    );
  }
}

// --- helper to wrap text into lines
function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    if ((line + " " + w).trim().length > maxChars) {
      lines.push(line.trim());
      line = w;
    } else {
      line += " " + w;
    }
  }
  if (line.trim()) lines.push(line.trim());
  return lines;
}
