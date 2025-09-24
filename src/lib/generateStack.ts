/* eslint-disable @typescript-eslint/consistent-type-imports */
import getSubmissionWithChildren from "@/lib/getSubmissionWithChildren";
import type { SubmissionWithChildren } from "@/lib/getSubmissionWithChildren";
import { ChatCompletionMessageParam } from "openai/resources";
import { applySafetyChecks } from "@/lib/safetyCheck";
import { enrichAffiliateLinks } from "@/lib/affiliateLinks";
import { supabaseAdmin } from "@/lib/supabase";

const TODAY = "2025-09-21";
const MIN_WORDS = 1800;
const MIN_BP_ROWS = 10;
const CITE_RE = /(https?:\/\/(?:pubmed\.|doi\.org)[^\s)]+)/i;

const HEADINGS = [
  "## Intro Summary",
  "## Goals",
  "## Contraindications & Med Interactions",
  "## Current Stack",
  "## Your Blueprint Recommendations",
  "## Dosing & Notes",
  "## Evidence & References",
  "## Shopping Links",
  "## Follow-up Plan",
  "## Lifestyle Prescriptions",
  "## Longevity Levers",
  "## This Week Try",
  "## END",
];

const wc = (t: string) => t.trim().split(/\s+/).length;
const hasEnd = (t: string) => t.includes("## END");
const seeDN = "See Dosing & Notes";

function age(dob: string | null) {
  if (!dob) return null;
  const d = new Date(dob),
    t = new Date(TODAY);
  let a = t.getFullYear() - d.getFullYear();
  if (t < new Date(t.getFullYear(), d.getMonth(), d.getDate())) a--;
  return a;
}
function extractUserId(sub: any): string | null {
  return sub?.user_id ?? (typeof sub.user === "object" ? sub.user?.id : null) ?? null;
}
function normalizeTiming(raw?: string | null): string | null {
  if (!raw) return null;
  const s = raw.toLowerCase();
  if (/am|morning/.test(s)) return "AM";
  if (/pm|evening|night/.test(s)) return "PM";
  if (/am\/pm|both|split|bid/.test(s)) return "AM/PM";
  return raw.trim();
}
function normalizeUnit(u?: string | null) {
  const s = (u ?? "").toLowerCase();
  if (s === "μg" || s === "mcg" || s === "ug") return "mcg";
  if (s === "iu") return "IU";
  if (s === "mg" || s === "g") return s;
  return s || null;
}
function parseDose(dose?: string | null): { amount?: number; unit?: string } {
  if (!dose) return {};
  const cleaned = dose.replace(/[,]/g, " ").replace(/\s+/g, " ");
  const matches = cleaned.match(/(\d+(?:\.\d+)?)/g);
  if (!matches) return {};
  const amount = parseFloat(matches[matches.length - 1]);
  const unitMatch = cleaned.match(/(mcg|μg|ug|mg|g|iu)\b/i);
  const rawUnit = unitMatch ? unitMatch[1] : "";
  let unit = normalizeUnit(rawUnit);
  let val = amount;
  if (unit === "g") {
    val = amount * 1000;
    unit = "mg";
  }
  return { amount: val, unit: unit ?? undefined };
}
function parseStackFromMarkdown(md: string) {
  const base: Record<string, any> = {};
  const blueprint = md.match(/## Your Blueprint Recommendations([\s\S]*?)(\n## |$)/i);
  if (blueprint) {
    const rows = blueprint[1].split("\n").filter((l) => l.trim().startsWith("|"));
    rows.slice(1).forEach((row, i) => {
      const cols = row.split("|").map((c) => c.trim());
      const name = cols[2] || `Item ${i + 1}`;
      base[name.toLowerCase()] = {
        name,
        rationale: cols[3] || undefined,
        dose: null,
        dose_parsed: null,
        timing: null,
      };
    });
  }
  const dosing = md.match(/## Dosing & Notes([\s\S]*?)(\n## |\n## END|$)/i);
  if (dosing) {
    const lines = dosing[1].split("\n").filter((l) => l.trim().length > 0);
    for (const line of lines) {
      const m = line.match(/[-*]\s*([^—\-:]+)[—\-:]\s*([^,]+)(?:,\s*(.*))?/);
      if (m) {
        const name = m[1].trim();
        const dose = m[2]?.trim() || null;
        const timing = normalizeTiming(m[3]);
        const parsed = parseDose(dose);
        const key = name.toLowerCase();
        if (base[key]) {
          base[key].dose = dose;
          base[key].dose_parsed = parsed;
          base[key].timing = timing;
        } else {
          base[key] = { name, rationale: undefined, dose, dose_parsed: parsed, timing };
        }
      }
    }
  }
  return Object.values(base);
}
function systemPrompt() {
  return `
You are **LVE360 Concierge AI**, a friendly but professional wellness coach.
Tone: encouraging, plain-English, never clinical or robotic.
Always explain *why it matters* in a supportive, human way.
Always greet the client by name in the Intro Summary if provided.

Return **plain ASCII Markdown only** with headings EXACTLY:

${HEADINGS.slice(0, -1).join("\n")}

Tables must use \`Column | Column\` pipe format, **no curly quotes or bullets**.
Every table/list MUST be followed by **Analysis** ≥3 sentences.

... (same as before) ...`;
}
function userPrompt(sub: SubmissionWithChildren) {
  return `
### CLIENT
\`\`\`json
${JSON.stringify({ ...sub, age: age((sub as any).dob ?? null), today: TODAY }, null, 2)}
\`\`\`

### TASK
Generate the full report per the rules above.`;
}
async function callLLM(messages: ChatCompletionMessageParam[], model: string) {
  const { default: OpenAI } = await import("openai");
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
  const resp = await openai.chat.completions.create({
    model,
    temperature: 0.7,
    max_tokens: 4096,
    messages,
  });
  return resp;
}
function ensureEnd(md: string) {
  return hasEnd(md) ? md : md + "\n\n## END";
}

export async function generateStackForSubmission(id: string) {
  if (!id) throw new Error("submissionId required");
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY missing");

  const sub = await getSubmissionWithChildren(id);
  if (!sub) throw new Error(`Submission row not found for id=${id}`);
  const user_id = extractUserId(sub);

  const msgs: ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt() },
    { role: "user", content: userPrompt(sub) },
  ];

  let md = "";
  let raw: any = null;
  let modelUsed = "unknown";
  let tokensUsed: number | null = null;
  let promptTokens: number | null = null;
  let completionTokens: number | null = null;

  try {
    const resp = await callLLM(msgs, "gpt-4o-mini");
    raw = resp;
    modelUsed = resp.model ?? "gpt-4o-mini";
    md = resp.choices[0]?.message?.content ?? "";
    tokensUsed = resp.usage?.total_tokens ?? null;
    promptTokens = resp.usage?.prompt_tokens ?? null;
    completionTokens = resp.usage?.completion_tokens ?? null;
  } catch {
    const resp = await callLLM(msgs, "gpt-4o");
    raw = resp;
    modelUsed = resp.model ?? "gpt-4o";
    md = resp.choices[0]?.message?.content ?? "";
    tokensUsed = resp.usage?.total_tokens ?? null;
    promptTokens = resp.usage?.prompt_tokens ?? null;
    completionTokens = resp.usage?.completion_tokens ?? null;
  }

  md = ensureEnd(md);

  // Parse supplements
  const items = parseStackFromMarkdown(md);
  const { cleaned } = await applySafetyChecks(
    {
      medications: sub.medications?.map((m: any) => m.med_name) ?? [],
      conditions: sub.conditions?.map((c: any) => c.condition_name) ?? [],
      allergies: sub.allergies?.map((a: any) => a.allergy_name) ?? [],
    },
    items
  );
  const finalStack = await enrichAffiliateLinks(cleaned);

  // Upsert stack
  const { data: parentRows, error: parentErr } = await supabaseAdmin
    .from("stacks")
    .upsert(
      {
        submission_id: id,
        user_id,
        user_email: sub.user_email,
        version: modelUsed,
        tokens_used: tokensUsed,
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
      },
      { onConflict: "submission_id" }
    )
    .select();

  if (parentErr) {
    console.error("Supabase upsert error:", parentErr);
    return { markdown: md, raw };
  }

  const parent = parentRows?.[0];
  if (parent?.id && user_id) {
    await supabaseAdmin.from("stacks_items").delete().eq("stack_id", parent.id);

    // ✅ Deduplicate + filter invalid names
    const rows = Array.from(
      new Map(
        finalStack
          .filter((it: any) => it?.name && it.name.trim().length > 0)
          .map((it: any) => [it.name.toLowerCase(), it])
      ).values()
    ).map((it: any) => ({
      stack_id: parent.id,
      user_id,
      name: it.name.trim(),
      dose: it.dose ?? null,
      timing: it.timing ?? null,
      notes: it.notes ?? null,
      rationale: it.rationale ?? null,
      caution: it.caution ?? null,
      citations: it.citations ? JSON.stringify(it.citations) : null,
      link_amazon: it.link_amazon ?? null,
      link_fullscript: it.link_fullscript ?? null,
      link_thorne: it.link_thorne ?? null,
      link_other: it.link_other ?? null,
      cost_estimate: it.cost_estimate ?? null,
    }));

    if (rows.length > 0) {
      const { error } = await supabaseAdmin.from("stacks_items").insert(rows);
      if (error) console.error("⚠️ Failed to insert stacks_items:", error);
      else console.log(`✅ Inserted ${rows.length} stack items for stack ${parent.id}`);
    }
  }

  return {
    markdown: md,
    raw,
    model_used: modelUsed,
    tokens_used: tokensUsed,
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
  };
}

export default generateStackForSubmission;
