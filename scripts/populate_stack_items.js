// scripts/populate_stack_items.js
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

/**
 * Simple markdown -> structured items parser.
 * - Splits by "## " section headings
 * - For each section extracts list bullets starting with "- " and keeps the text block
 * Returns array: [{ section, bullets: [..], text: "..." }, ...]
 */
function parseMarkdownToItems(md) {
  if (!md || typeof md !== 'string') return [];
  // Normalize newlines
  const normalized = md.replace(/\r\n/g, '\n');
  // Remove leading content before first "## " if you want only sections
  const parts = normalized.split(/\n##\s+/).map(s => s.trim()).filter(Boolean);
  const result = parts.map(part => {
    // Title is first line up to newline
    const lines = part.split('\n');
    const titleLine = lines[0].trim();
    const rest = lines.slice(1).join('\n').trim();
    // Extract bullets (lines starting with "- " or "* ")
    const bullets = (rest.match(/(^[-*]\s+.+$)/gm) || []).map(b => b.replace(/^[-*]\s+/, '').trim());
    return { section: titleLine, bullets, text: rest };
  });
  return result;
}

async function fetchAndUpdate(stackId) {
  try {
    console.log('Fetching stack:', stackId);
    const { data: rows, error } = await supabase
      .from('stacks')
      .select('*')
      .eq('id', stackId)
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (!rows) {
      console.log('No stack found for id:', stackId);
      return;
    }
    const stack = rows;
    // Inspect likely locations for markdown output
    let md = null;
    // Common candidates (check these in order)
    if (stack.sections && typeof stack.sections === 'object') {
      try {
        const s = stack.sections;
        md = s?.raw?.output_text || s?.raw?.text?.content || s?.output_text || s?.markdown || null;
      } catch (_) { md = null; }
    }
    // fallback: top-level ai.markdown or ai.raw.output_text
    if (!md && stack.ai && typeof stack.ai === 'object') {
      md = stack.ai?.markdown || stack.ai?.raw?.output_text || null;
    }
    // fallback: top-level 'summary' or 'output_text'
    if (!md) md = stack.summary || stack.output_text || null;

    if (!md) {
      console.warn('No markdown text found in stack (cannot parse). Example keys on row:', Object.keys(stack));
      console.log('Try examine stack row manually in Supabase or re-run with --debug');
      return;
    }

    // Parse
    const items = parseMarkdownToItems(md);
    console.log('Parsed items sections count:', items.length);

    // Update DB
    const { data: up, error: upErr } = await supabase
      .from('stacks')
      .update({ items })
      .eq('id', stackId)
      .select('id, items')
      .maybeSingle();

    if (upErr) throw upErr;
    console.log('Updated stack.items for', stackId);
    console.log('New items:', JSON.stringify(up.items, null, 2));
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

// CLI run: node scripts/populate_stack_items.js <stack-id>
const stackId = process.argv[2];
if (!stackId) {
  console.error('Usage: node scripts/populate_stack_items.js <stack-id>');
  process.exit(1);
}

fetchAndUpdate(stackId).then(() => process.exit(0));
