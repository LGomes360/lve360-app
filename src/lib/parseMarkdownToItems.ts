// src/lib/parseMarkdownToItems.ts
// Simple Markdown -> structured items parser used by generate-stack.
// Returns array: [{ section: string, bullets: string[], text: string }, ...]
export function parseMarkdownToItems(md: string) {
  if (!md || typeof md !== 'string') return [];

  // normalize newlines
  const normalized = md.replace(/\r\n/g, '\n');

  // remove leading content before first "## " so each part is a section (handle files that start with "# ")
  // If the file uses "## " as section markers, this splits on them.
  const parts = normalized.split(/\n##\s+/).map(s => s.trim()).filter(Boolean);

  // If we found no "##" sections, fallback to splitting on top-level headers (# or "##")
  if (parts.length === 0) {
    const alt = normalized.split(/\n#\s+/).map(s => s.trim()).filter(Boolean);
    if (alt.length) parts.push(...alt);
  }

  const result = parts.map(part => {
    // First line is the section title
    const lines = part.split('\n');
    const title = lines[0].trim();
    const rest = lines.slice(1).join('\n').trim();

    // Extract bullets (lines starting with "- " or "* ")
    const bullets = (rest.match(/(^[-*]\s+.+$)/gm) || []).map(b => b.replace(/^[-*]\s+/, '').trim());

    // If bullets look like sublists (e.g., "  - item"), normalize them
    const normalizedBullets = bullets.map(b => b.replace(/^\s*[-*]\s*/, '').trim());

    return {
      section: title,
      bullets: normalizedBullets,
      text: rest
    };
  });

  return result;
}
