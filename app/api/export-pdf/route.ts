// app/api/export-pdf/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { PDFDocument, rgb } from "pdf-lib";
import path from "path";
import fs from "fs";
import { remark } from "remark";
import html from "remark-html";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const submissionId = searchParams.get("submission_id");

    if (!submissionId) {
      return NextResponse.json({ ok: false, error: "Missing submission_id" }, { status: 400 });
    }

    // --- Load stack from DB ---
    const { data, error } = await supabaseAdmin
      .from("stacks")
      .select("sections")
      .eq("submission_id", submissionId)
      .single();

    if (error) {
      console.error("Supabase error:", error);
      return NextResponse.json({ ok: false, error: "DB error fetching stack" }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ ok: false, error: "Stack not found" }, { status: 404 });
    }

    const markdown = data.sections?.markdown ?? "## Error\n\nNo content available.";

    // --- Convert Markdown → HTML ---
    const processed = await remark().use(html).process(markdown);
    const htmlContent = String(processed);

    // --- Initialize PDF ---
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.28, 841.89]); // A4 size in points

    // Embed Poppins font (must be in /public/fonts)
    const fontPath = path.join(process.cwd(), "public/fonts/Poppins-Regular.ttf");
    const fontBytes = fs.readFileSync(fontPath);
    const customFont = await pdfDoc.embedFont(fontBytes);

    const { height } = page.getSize();

    // Draw title
    page.drawText("LVE360 Blueprint", {
      x: 50,
      y: height - 80,
      size: 20,
      font: customFont,
      color: rgb(0.02, 0.12, 0.18), // brand dark
    });

    // Render plain text fallback (quick integration)
    page.drawText(markdown.slice(0, 2000), {
      x: 50,
      y: height - 120,
      size: 12,
      font: customFont,
      lineHeight: 14,
      color: rgb(0.1, 0.1, 0.1),
    });

    const pdfBytes = await pdfDoc.save();

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="LVE360_Blueprint.pdf"`,
      },
    });
  } catch (err: any) {
    console.error("PDF export error:", err);
    return NextResponse.json({ ok: false, error: "PDF export failed" }, { status: 500 });
  }
}
