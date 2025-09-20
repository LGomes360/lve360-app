// app/api/export-pdf/route.ts
import { NextResponse } from "next/server";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { supabaseAdmin } from "@/lib/supabase";

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

    // 1. Load stack from DB
    const { data, error } = await supabaseAdmin
      .from("stacks")
      .select("sections")
      .eq("submission_id", submissionId)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { ok: false, error: "No stack found" },
        { status: 404 }
      );
    }

    const markdown = data.sections?.markdown ?? "No report available";

    // 2. Create PDF
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595, 842]); // A4 size
    const { height } = page.getSize();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const text = `LVE360 Blueprint\n\n${markdown}`;

    page.drawText(text, {
      x: 50,
      y: height - 80,
      size: 12,
      font,
      color: rgb(0, 0, 0),
      lineHeight: 16,
      maxWidth: 495,
    });

    const pdfBytes = await pdfDoc.save();

    // 3. Return as download
    return new NextResponse(pdfBytes, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="LVE360_Blueprint.pdf"`,
      },
    });
  } catch (err: any) {
    console.error("export-pdf failed:", err);
    return NextResponse.json(
      { ok: false, error: String(err.message ?? err) },
      { status: 500 }
    );
  }
}
