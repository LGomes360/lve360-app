// app/api/export-pdf/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { remark } from "remark";
import html from "remark-html";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const submissionId = searchParams.get("submission_id");

    if (!submissionId) {
      return NextResponse.json({ ok: false, error: "Missing submission_id" }, { status: 400 });
    }

    // 1. Fetch stack from Supabase
    const { data, error } = await supabaseAdmin
      .from("stacks")
      .select("sections")
      .or(`submission_id.eq.${submissionId},tally_submission_id.eq.${submissionId}`)
      .limit(1)
      .single();

    if (error) {
      console.error("DB error fetching stack:", error);
      return NextResponse.json({ ok: false, error: "DB error fetching stack" }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ ok: false, error: "Stack not found" }, { status: 404 });
    }

    const markdown = data.sections?.markdown ?? "## No content available";

    // 2. Convert Markdown → HTML
    const processed = await remark().use(html).process(markdown);
    const htmlContent = processed.toString();

    // 3. Create PDF
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612, 792]); // Letter size
    const { height } = page.getSize();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

    // Simple text version (for now); HTML renderer could be added later
    const text = markdown.replace(/[#*]/g, ""); // Strip Markdown syntax
    const lines = text.split("\n");
    let y = height - 50;
    for (const line of lines) {
      page.drawText(line, { x: 50, y, size: 12, font, color: rgb(0, 0, 0) });
      y -= 18;
      if (y < 50) break; // prevent overflow for now
    }

    const pdfBytes = await pdfDoc.save();

    return new NextResponse(pdfBytes, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="LVE360_Blueprint.pdf"',
      },
    });
  } catch (err: any) {
    console.error("Unhandled error in export-pdf:", err);
    return NextResponse.json({ ok: false, error: "PDF export failed" }, { status: 500 });
  }
}
