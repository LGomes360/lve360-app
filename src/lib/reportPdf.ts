import { PDFArray, PDFDocument, PDFFont, PDFName, PDFPage, PDFString, StandardFonts, rgb, type RGB } from "pdf-lib";
import { parseBlueprintReport } from "./blueprintReport";
import { cleanReportDisplayText, REPORT_THEME_RGB, reportSectionTitle } from "./reportPresentation";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 42;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const FOOTER_Y = 25;
const CONTENT_BOTTOM = 48;

const NAVY = rgb(...REPORT_THEME_RGB.navy);
const TEAL = rgb(...REPORT_THEME_RGB.teal);
const PALE_TEAL = rgb(...REPORT_THEME_RGB.paleTeal);
const PALE_BLUE = rgb(...REPORT_THEME_RGB.paleBlue);
const PALE_AMBER = rgb(...REPORT_THEME_RGB.paleAmber);
const PALE_RED = rgb(1, 0.93, 0.91);
const TEXT = rgb(...REPORT_THEME_RGB.slate);
const MUTED = rgb(...REPORT_THEME_RGB.muted);
const BORDER = rgb(...REPORT_THEME_RGB.border);
const WHITE = rgb(1, 1, 1);

function pdfText(value: string): string {
  return cleanReportDisplayText(String(value ?? ""))
    .replace(/â€”|â€“|\u2014|\u2013/g, "-")
    .replace(/â€¢|\u2022/g, "-")
    .replace(/â‰¥|\u2265/g, ">=")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\u2026/g, "...")
    .replace(/\u00a0/g, " ")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, "$1")
    .replace(/[*_`]/g, "")
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const clean = pdfText(text);
  if (!clean) return [];
  const lines: string[] = [];
  let line = "";
  const words = clean.split(/\s+/).flatMap((word) => {
    if (font.widthOfTextAtSize(word, size) <= maxWidth) return [word];
    const chunks: string[] = [];
    let chunk = "";
    for (const character of word) {
      if (chunk && font.widthOfTextAtSize(`${chunk}${character}`, size) > maxWidth) {
        chunks.push(chunk);
        chunk = character;
      } else {
        chunk += character;
      }
    }
    if (chunk) chunks.push(chunk);
    return chunks;
  });
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && font.widthOfTextAtSize(candidate, size) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function sectionBody(markdown: string, heading: string): string {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return markdown.match(new RegExp(`## ${escaped}([\\s\\S]*?)(?=\\n## |$)`, "i"))?.[1] ?? "";
}

function focusItems(markdown: string): string[] {
  return sectionBody(markdown, "This Week Try")
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-*]\s+/, "").trim())
    .filter((line) => line && !/^\*\*Analysis\*\*/i.test(line) && !/^Analysis\b/i.test(pdfText(line)))
    .map(pdfText)
    .filter(Boolean)
    .slice(0, 5);
}

export async function renderReportPdf(markdown: string, disclaimer: string): Promise<Uint8Array> {
  const report = parseBlueprintReport(markdown);
  markdown = report.canonicalMarkdown;
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle("LVE360 Blueprint");
  pdfDoc.setAuthor("LVE360");
  pdfDoc.setSubject("Personalized wellness blueprint");
  pdfDoc.setKeywords(["LVE360", "wellness", `report-${report.contentHash}`]);
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let page!: PDFPage;
  let cursorY = 0;

  const addLinkAnnotation = (targetPage: PDFPage, x: number, y: number, width: number, height: number, url: string) => {
    const annotation = pdfDoc.context.register(pdfDoc.context.obj({
      Type: "Annot",
      Subtype: "Link",
      Rect: [x, y, x + width, y + height],
      Border: [0, 0, 0],
      A: { Type: "Action", S: "URI", URI: PDFString.of(url) },
    }));
    let annotations = targetPage.node.lookupMaybe(PDFName.of("Annots"), PDFArray);
    if (!annotations) {
      annotations = pdfDoc.context.obj([]);
      targetPage.node.set(PDFName.of("Annots"), annotations);
    }
    annotations.push(annotation);
  };

  const drawBrandHeader = (targetPage: PDFPage = page) => {
    targetPage.drawRectangle({ x: 0, y: PAGE_HEIGHT - 62, width: PAGE_WIDTH, height: 62, color: NAVY });
    targetPage.drawText("LVE360", { x: MARGIN, y: PAGE_HEIGHT - 34, size: 19, font: bold, color: WHITE });
    targetPage.drawText("LONGEVITY  |  VITALITY  |  ENERGY", { x: MARGIN + 92, y: PAGE_HEIGHT - 32, size: 8.5, font: regular, color: rgb(0.55, 0.91, 0.84) });
    targetPage.drawRectangle({ x: MARGIN, y: PAGE_HEIGHT - 64, width: 78, height: 3, color: TEAL });
  };

  const addPage = () => {
    page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    drawBrandHeader();
    cursorY = PAGE_HEIGHT - 86;
  };

  const ensureSpace = (height: number) => {
    if (cursorY - height < CONTENT_BOTTOM) addPage();
  };

  const drawLines = (
    lines: string[],
    options: { x?: number; size?: number; leading?: number; font?: PDFFont; color?: RGB } = {}
  ) => {
    const x = options.x ?? MARGIN;
    const size = options.size ?? 10.5;
    const leading = options.leading ?? size + 3.2;
    const usedFont = options.font ?? regular;
    const color = options.color ?? TEXT;
    ensureSpace(lines.length * leading + 2);
    for (const line of lines) {
      page.drawText(line, { x, y: cursorY, size, font: usedFont, color });
      cursorY -= leading;
    }
  };

  const drawParagraph = (text: string, options: { indent?: number; color?: RGB; size?: number; font?: PDFFont } = {}) => {
    const indent = options.indent ?? 0;
    const size = options.size ?? 10.5;
    const usedFont = options.font ?? regular;
    drawLines(wrap(text, usedFont, size, CONTENT_WIDTH - indent), {
      x: MARGIN + indent,
      size,
      font: usedFont,
      color: options.color ?? TEXT,
    });
    cursorY -= 4;
  };

  const drawLinkedBullet = (raw: string) => {
    const links = Array.from(raw.matchAll(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g));
    const display = raw.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, "$1");
    const lines = wrap(display, regular, 10.5, CONTENT_WIDTH - 13);
    ensureSpace(lines.length * 13.7 + 4);
    page.drawCircle({ x: MARGIN + 4, y: cursorY + 3, size: 2.2, color: TEAL });
    const link = links[0]?.[2];
    for (const line of lines) {
      page.drawText(line, { x: MARGIN + 13, y: cursorY, size: 10.5, font: regular, color: link ? NAVY : TEXT });
      if (link) addLinkAnnotation(page, MARGIN + 11, cursorY - 2, Math.min(regular.widthOfTextAtSize(line, 10.5) + 5, CONTENT_WIDTH - 11), 13, link);
      cursorY -= 13.7;
    }
    cursorY -= 4;
  };

  const drawSectionHeader = (title: string) => {
    ensureSpace(/Follow-up Plan/i.test(title) ? 165 : 38);
    const safety = /Contraindications/i.test(title);
    page.drawRectangle({
      x: MARGIN,
      y: cursorY - 22,
      width: CONTENT_WIDTH,
      height: 28,
      color: safety ? PALE_RED : PALE_TEAL,
      borderColor: safety ? rgb(0.86, 0.48, 0.42) : rgb(0.58, 0.82, 0.77),
      borderWidth: 0.7,
    });
    page.drawText(pdfText(reportSectionTitle(title)), { x: MARGIN + 11, y: cursorY - 13, size: 12.5, font: bold, color: NAVY });
    cursorY -= 37;
    if (safety) {
      ensureSpace(42);
      page.drawRectangle({ x: MARGIN, y: cursorY - 32, width: CONTENT_WIDTH, height: 34, color: PALE_AMBER, borderColor: rgb(0.88, 0.7, 0.32), borderWidth: 0.8 });
      page.drawText("SAFETY REVIEW", { x: MARGIN + 10, y: cursorY - 12, size: 8, font: bold, color: NAVY });
      page.drawText("Only material cautions are highlighted; items without a specific flag are omitted.", {
        x: MARGIN + 10, y: cursorY - 25, size: 8.5, font: regular, color: TEXT,
      });
      cursorY -= 43;
    }
  };

  const drawStatusPill = (status: string, x: number, y: number, maxWidth: number) => {
    const label = pdfText(status);
    const color = status === "Current - optimize" ? rgb(0.78, 0.92, 0.88) : status === "Clinician review" ? rgb(1, 0.88, 0.7) : rgb(0.82, 0.9, 0.98);
    const textWidth = Math.min(bold.widthOfTextAtSize(label, 7.2), maxWidth - 12);
    const width = Math.min(textWidth + 14, maxWidth - 4);
    const centerY = y + 7;
    page.drawRectangle({ x: x + 5, y: centerY - 5, width: Math.max(1, width - 10), height: 10, color });
    page.drawCircle({ x: x + 5, y: centerY, size: 5, color });
    page.drawCircle({ x: x + width - 5, y: centerY, size: 5, color });
    page.drawText(label, { x: x + 7, y: centerY - 2.5, size: 7.2, font: bold, color: NAVY, maxWidth: width - 12 });
  };

  const drawTable = (rawLines: string[]) => {
    const rows = rawLines
      .filter((line) => !/^\s*\|?\s*:?-{3,}/.test(line))
      .map((line) => line.split("|").slice(1, -1).map(pdfText));
    if (!rows.length) return;
    const columnCount = Math.max(...rows.map((row) => row.length));
    const header = rows[0];
    const isBlueprint = header.some((cell) => /status/i.test(cell));
    const statusColumn = header.findIndex((cell) => /status/i.test(cell));
    const isCurrent = header.some((cell) => /current item/i.test(cell));
    const proportions = isBlueprint && columnCount === 4
      ? [0.08, 0.25, 0.2, 0.47]
      : isCurrent && columnCount === 5
        ? [0.24, 0.16, 0.2, 0.18, 0.22]
        : Array.from({ length: columnCount }, () => 1 / columnCount);
    const widths = proportions.map((part) => CONTENT_WIDTH * part);

    const drawRow = (row: string[], rowIndex: number, isHeader = false) => {
      const cellFont = isHeader ? bold : regular;
      const cellSize = isHeader ? 8.2 : 8;
      const wrapped = row.map((cell, index) => wrap(cell, cellFont, cellSize, Math.max(28, widths[index] - 12)));
      const rowHeight = Math.max(22, ...wrapped.map((lines) => lines.length * 10 + 8));
      const y = cursorY - rowHeight;
      page.drawRectangle({
        x: MARGIN,
        y,
        width: CONTENT_WIDTH,
        height: rowHeight,
        color: isHeader ? NAVY : rowIndex % 2 === 0 ? PALE_BLUE : WHITE,
        borderColor: BORDER,
        borderWidth: 0.45,
      });
      let x = MARGIN;
      row.forEach((cell, index) => {
        if (index > 0) page.drawLine({ start: { x, y }, end: { x, y: y + rowHeight }, color: BORDER, thickness: 0.4 });
        if (isBlueprint && index === statusColumn && !isHeader) {
          drawStatusPill(cell, x + 3, y + rowHeight / 2 - 7, widths[index] - 6);
        } else {
          wrapped[index].forEach((line, lineIndex) => {
            page.drawText(line, {
              x: x + 6,
              y: y + rowHeight - 11 - lineIndex * 10,
              size: cellSize,
              font: cellFont,
              color: isHeader ? WHITE : TEXT,
              maxWidth: widths[index] - 12,
            });
          });
        }
        x += widths[index];
      });
      cursorY = y;
    };

    rows.forEach((row, rowIndex) => {
      const isHeader = rowIndex === 0;
      const previewFont = isHeader ? bold : regular;
      const previewSize = isHeader ? 8.2 : 8;
      const rowHeight = Math.max(22, ...row.map((cell, index) =>
        wrap(cell, previewFont, previewSize, Math.max(28, widths[index] - 12)).length * 10 + 8
      ));
      if (cursorY - rowHeight < CONTENT_BOTTOM) {
        addPage();
        if (!isHeader) drawRow(header, 0, true);
      }
      drawRow(row, rowIndex, isHeader);
    });
    cursorY -= 9;
  };

  const drawFocusCard = (items: string[]) => {
    if (!items.length) return;
    const itemLines = items.map((item, index) => wrap(`${index + 1}. ${item}`, regular, 9.2, CONTENT_WIDTH - 30));
    const height = 32 + itemLines.reduce((sum, lines) => sum + Math.max(13, lines.length * 11), 0);
    ensureSpace(height + 10);
    page.drawRectangle({ x: MARGIN, y: cursorY - height, width: CONTENT_WIDTH, height, color: PALE_BLUE, borderColor: rgb(0.45, 0.65, 0.82), borderWidth: 0.9 });
    page.drawText("THIS WEEK FOCUS", { x: MARGIN + 13, y: cursorY - 20, size: 10, font: bold, color: NAVY });
    let y = cursorY - 37;
    itemLines.forEach((lines) => {
      lines.forEach((line) => {
        page.drawText(line, { x: MARGIN + 15, y, size: 9.2, font: regular, color: TEXT });
        y -= 11;
      });
      y -= 2;
    });
    cursorY -= height + 13;
  };

  addPage();
  drawFocusCard(report.focusItems);

  const lines = markdown.split(/\r?\n/);
  let currentSection = "";
  for (let index = 0; index < lines.length; index++) {
    const raw = lines[index];
    const line = raw.trim();
    if (!line || /^##\s*END$/i.test(line)) {
      cursorY -= 4;
      continue;
    }
    if (line.startsWith("|")) {
      const table: string[] = [];
      while (index < lines.length && lines[index].trim().startsWith("|")) {
        table.push(lines[index].trim());
        index++;
      }
      index--;
      drawTable(table);
      continue;
    }
    if (/^##\s+/.test(line)) {
      const heading = line.replace(/^##\s+/, "");
      currentSection = heading;
      if (/^Important Wellness Disclaimer$/i.test(heading)) {
        while (index + 1 < lines.length && !/^##\s+/.test(lines[index + 1].trim())) index++;
        continue;
      }
      // This content is already promoted into the opening focus card.
      if (/^This Week Try$/i.test(heading) && report.focusItems.length) {
        while (index + 1 < lines.length && !/^##\s+/.test(lines[index + 1].trim())) index++;
        continue;
      }
      drawSectionHeader(heading);
      continue;
    }
    if (/^###\s+/.test(line)) {
      // Keep subsection headings with the first line of content that follows.
      // Without this reservation, headings can be orphaned at the foot of a page.
      let nextContent = "";
      for (let lookahead = index + 1; lookahead < lines.length; lookahead++) {
        const candidate = lines[lookahead].trim();
        if (!candidate) continue;
        if (/^#{1,3}\s+/.test(candidate)) break;
        nextContent = candidate.replace(/^[-*]\s+/, "");
        break;
      }
      const nextContentHeight = nextContent
        ? wrap(pdfText(nextContent), regular, 9.5, CONTENT_WIDTH).length * 12 + 8
        : 16;
      ensureSpace(24 + Math.min(nextContentHeight, 72));
      drawParagraph(line.replace(/^###\s+/, ""), { font: bold, size: 10.5, color: NAVY });
      continue;
    }
    if (/^#\s+/.test(line)) {
      drawParagraph(line.replace(/^#\s+/, ""), { font: bold, size: 15, color: NAVY });
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      const bullet = line.replace(/^[-*]\s+/, "");
      if (/^(?:Evidence & References|Shopping Links)$/i.test(currentSection) && /\[[^\]]+\]\(https?:\/\//.test(bullet)) {
        drawLinkedBullet(bullet);
        continue;
      }
      ensureSpace(18);
      page.drawCircle({ x: MARGIN + 4, y: cursorY + 3, size: 2.2, color: TEAL });
      drawParagraph(bullet, { indent: 13 });
      continue;
    }
    if (/^\*\*Analysis\*\*/i.test(line) || /^Analysis\s*:?$/i.test(line)) continue;
    drawParagraph(line);
  }

  const disclaimerLines = wrap(disclaimer, regular, 8.2, CONTENT_WIDTH - 20);
  const disclaimerHeight = disclaimerLines.length * 10 + 34;
  ensureSpace(disclaimerHeight + 10);
  cursorY -= 6;
  page.drawRectangle({ x: MARGIN, y: cursorY - disclaimerHeight, width: CONTENT_WIDTH, height: disclaimerHeight, color: PALE_BLUE, borderColor: BORDER, borderWidth: 0.7 });
  page.drawText("IMPORTANT WELLNESS DISCLAIMER", { x: MARGIN + 10, y: cursorY - 15, size: 8.6, font: bold, color: NAVY });
  disclaimerLines.forEach((line, index) => {
    page.drawText(line, { x: MARGIN + 10, y: cursorY - 29 - index * 10, size: 8.2, font: regular, color: MUTED });
  });
  cursorY -= disclaimerHeight;

  const pages = pdfDoc.getPages();
  pages.forEach((pdfPage, index) => {
    drawBrandHeader(pdfPage);
    pdfPage.drawLine({ start: { x: MARGIN, y: 41 }, end: { x: PAGE_WIDTH - MARGIN, y: 41 }, color: BORDER, thickness: 0.5 });
    pdfPage.drawText("Educational wellness guidance.", {
      x: MARGIN, y: FOOTER_Y, size: 7.2, font: regular, color: MUTED,
    });
    const pageLabel = `Page ${index + 1} of ${pages.length}`;
    pdfPage.drawText(pageLabel, {
      x: PAGE_WIDTH - MARGIN - regular.widthOfTextAtSize(pageLabel, 7.2),
      y: FOOTER_Y,
      size: 7.2,
      font: regular,
      color: MUTED,
    });
  });

  // Disable compressed object streams for maximum compatibility across browser,
  // desktop, and server-side PDF renderers.
  return pdfDoc.save({ useObjectStreams: false });
}
