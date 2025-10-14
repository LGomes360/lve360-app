// app/api/export-pdf/route.ts
// -----------------------------------------------------------------------------
// GET /api/export-pdf?submission_id=<UUID or Tally short id>
//     OR /api/export-pdf?tally_submission_id=<Tally short id>
// Generates a styled PDF (Markdown-based) with branding + static disclaimer.
// -----------------------------------------------------------------------------

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

// Helpers
function isUUID(id: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    id
  );
}
function stripFences(md: string) {
  return md
    .replace(/^```[a-z]*\n/i, "")
    .replace(/```$/, "")
    .replace(/\n?##\s*END\s*$/i, "")
    .trim();
}

// Static disclaimer text (matches Results page)
const DISCLAIMER_TEXT =
  "This plan from LVE360 (Longevity | Vitality | Energy) is for educational purposes only and is not medical advice. It is not intended to diagnose, treat, cure, or prevent any disease. Always consult with your healthcare provider before starting new supplements or making significant lifestyle changes, especially if you are pregnant, nursing, managing a medical condition, or taking prescriptions. Supplements are regulated under the Dietary Supplement Health and Education Act (DSHEA); results vary and no outcomes are guaranteed. If you experience unexpected effects, discontinue use and seek professional care. By using this report, you agree that decisions about your health remain your responsibility and that LVE360 is not liable for how information is applied.";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;

    const explicitTally = searchParams.get("tally_submission_id");
    const raw = explicitTally ?? searchParams.get("submission_id");

    if (!raw) {
      return NextResponse.json(
        { ok: false, error: "Missing identifier (submission_id or tally_submission_id)" },
        { status: 400 }
      );
    }

    // Fetch stack by UUID or short id
    let base = supabaseAdmin.from("stacks").select("*").limit(1);
    let query =
      explicitTally != null
        ? base.eq("tally_submission_id", explicitTally)
        : isUUID(raw!)
        ? base.eq("submission_id", raw!)
        : base.eq("tally_submission_id", raw!);

    const { data: stackRow, error: stackErr } = await query.maybeSingle();

    if (stackErr) {
      console.error("[EXPORT-PDF] DB error:", stackErr);
      return NextResponse.json({ ok: false, error: "DB error" }, { status: 500 });
    }
    if (!stackRow) {
      return NextResponse.json(
        { ok: false, error: "Stack not found" },
        { status: 404 }
      );
    }

    // Resolve content: prefer sections.markdown, else summary
    let content: string =
      (stackRow?.sections?.markdown as string | undefined) ??
      (stackRow?.summary as string | undefined) ??
      "No report content available.";

    content = stripFences(content);

    // --- Create PDF ---
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    let page = pdfDoc.addPage([612, 792]); // Letter
    const margin = 50;
    const lineGap = 4;

    let cursorY = page.getHeight() - margin;

    function addPage() {
      page = pdfDoc.addPage([612, 792]);
      cursorY = page.getHeight() - margin;
      drawHeader();
    }

    function drawText(
      text: string,
      size = 11,
      color = rgb(0, 0, 0),
      bold = false
    ) {
      if (cursorY < margin + size + lineGap) addPage();
      page.drawText(text, {
        x: margin,
        y: cursorY,
        size,
        font: bold ? boldFont : font,
        color,
      });
      cursorY -= size + lineGap;
    }

    function drawWrapped(text: string, size = 11, color = rgb(0, 0, 0)) {
      const maxWidth = page.getWidth() - margin * 2;
      const words = text.split(/\s+/);
      let line = "";
      for (const word of words) {
        const test = line ? line + " " + word : word;
        const width = (boldFont ?? font).widthOfTextAtSize(test, size);
        if (width > maxWidth) {
          drawText(line, size, color);
          line = word;
        } else {
          line = test;
        }
      }
      if (line) drawText(line, size, color);
    }

    function drawHeader() {
      drawText("LVE360 | Longevity • Vitality • Energy", 16, rgb(0.03, 0.76, 0.63), true);
      cursorY -= 6;
    }

    // --- Title/header ---
    drawHeader();

    // --- Render Markdown-ish plain text (simple, durable parser) ---
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      const l = line.trim();
      if (!l) {
        cursorY -= 6;
        continue;
      }
      if (l.startsWith("# ")) {
        drawText(l.replace(/^#\s+/, ""), 15, rgb(0.1, 0.2, 0.4), true);
        cursorY -= 6;
        continue;
      }
      if (l.startsWith("## ")) {
        drawText(l.replace(/^##\s+/, ""), 13, rgb(0.1, 0.2, 0.4), true);
        continue;
      }
      if (l.startsWith("- ")) {
        drawWrapped("• " + l.slice(2), 11, rgb(0, 0, 0));
        continue;
      }
      // crude table handling: just print lines at smaller size
      if (l.includes("|")) {
        if (/^\s*\|?\s*-+\s*\|/.test(l) || l.includes("---")) {
          // Skip separator rows
          continue;
        }
        drawWrapped(l, 9, rgb(0.25, 0.25, 0.25));
        continue;
      }
      drawWrapped(l, 11, rgb(0, 0, 0));
    }

    // --- Static Disclaimer (always last) ---
    cursorY -= 14;
    drawText("Important Wellness Disclaimer", 12, rgb(0.03, 0.76, 0.63), true);
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
    console.error("[EXPORT-PDF] Unhandled error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Unhandled error" },
      { status: 500 }
    );
  }
}
