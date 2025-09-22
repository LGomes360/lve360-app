// app/api/export-pdf/route.ts
// -----------------------------------------------------------------------------
// GET /api/export-pdf?submission_id=<uuid-or-tallyID>
// Renders the saved Markdown → styled HTML → PDF (teal headers, zebra rows,
// logo), then streams it back.
// -----------------------------------------------------------------------------
//
// • Uses Supabase service-role client to load the stack.
// • Converts Markdown → HTML via “marked” (ASCII-safe already).
// • Styles per LVE360 brand: teal #06C1A0 header rows, navy #041B2D headings,
//   zebra striping, Inter font, logo in header.
// • Generates the PDF in headless Chrome (puppeteer-core + @sparticuz/chromium).
// • Falls back gracefully — any error returns JSON { ok:false, error }.
// -----------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { marked } from "marked";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

export const runtime = "nodejs"; // keep on Node runtime (needs Chrome)

function markdownToHtml(md: string): string {
  const css = /* tailwind-like inline CSS */ `
    @font-face{font-family:Inter;src:url(https://rsms.me/inter/font-files/Inter-Regular.woff2) format("woff2");}
    body{font-family:Inter,Arial,sans-serif;margin:0 auto;max-width:7.1in;padding:24px;font-size:11px;line-height:1.45;color:#000}
    h1,h2,h3{color:#041B2D;margin:24px 0 12px 0}
    h2{font-size:18px}
    table{width:100%;border-collapse:collapse;margin:8px 0;font-size:11px}
    th{background:#06C1A0;color:#fff;font-weight:700;padding:6px;border:1px solid #ddd}
    td{padding:6px;border:1px solid #ddd}
    tr:nth-child(even) td{background:#f5f5f5}
    em{font-style:italic}
    header{display:flex;align-items:center;margin-bottom:24px}
    header img{height:40px;margin-right:12px}
  `;
  const sanitized = md.replace(/^```[a-z]*\n/i, "").replace(/```$/, "");
  return `
    <!doctype html><html><head>
      <meta charset="utf-8" />
      <style>${css}</style>
      <title>LVE360 Blueprint</title>
    </head><body>
      <header>
        <img src="https://lve360.com/logo.png" alt="LVE360 logo" />
        <h1 style="margin:0;color:#041B2D;font-size:22px">
          LVE360 • Longevity • Vitality • Energy
        </h1>
      </header>
      ${marked.parse(sanitized)}
    </body></html>
  `;
}

export async function GET(req: NextRequest) {
  try {
    const submissionId = new URL(req.url).searchParams.get("submission_id");
    if (!submissionId)
      return NextResponse.json(
        { ok: false, error: "submission_id required" },
        { status: 400 }
      );

    /* ---------- fetch saved stack ---------- */
    const isUUID =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        submissionId
      );

    const { data: stack, error } = await supabaseAdmin
      .from("stacks")
      .select("sections,summary")
      .limit(1)
      .maybeSingle()
      .eq(isUUID ? "submission_id" : "tally_submission_id", submissionId);

    if (error) throw error;
    if (!stack)
      return NextResponse.json({ ok: false, error: "Stack not found" }, { status: 404 });

    const markdown =
      stack.sections?.markdown ?? stack.summary ?? "No report content available.";
    const html = markdownToHtml(markdown);

    /* ---------- launch headless chrome ---------- */
    const browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdf = await page.pdf({
      printBackground: true,
      format: "Letter",
      margin: { top: "25mm", bottom: "25mm", left: "18mm", right: "18mm" },
    });
    await browser.close();

    return new NextResponse(pdf, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="LVE360_Blueprint.pdf"',
      },
    });
  } catch (err: any) {
    console.error("export-pdf error:", err);
    return NextResponse.json({ ok: false, error: String(err.message ?? err) }, { status: 500 });
  }
}
