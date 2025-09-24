// app/api/generate-stack/route.ts
// -----------------------------------------------------------------------------
// POST /api/generate-stack
// Accepts body:
//   - submissionId: UUID (preferred)
//   - OR tally_submission_id: short Tally id (e.g. "jaJMeJQ")
//
// Returns JSON: { ok: true, saved: true/false, stack?, ai? }
// -----------------------------------------------------------------------------
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { generateStackForSubmission } from "@/lib/generateStack";
import { parseMarkdownToItems } from "@/lib/parseMarkdownToItems";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    let submissionId =
      (body.submissionId ?? body.submission_id ?? "")?.toString().trim() || null;
    const tallyShort =
      (
        body.tally_submission_id ??
        body.tallyId ??
        body.tally ??
        ""
      )?.toString().trim() || null;

    console.log("[API] generate-stack received:", { submissionId, tallyShort });

    // If caller only gave short Tally id, resolve to UUID
    if (!submissionId && tallyShort) {
      const resp: any = await supabaseAdmin
        .from("submissions")
        .select("id,tally_submission_id,user_email")
        .eq("tally_submission_id", tallyShort)
        .limit(1);

      if (resp?.error) {
        console.error("Error resolving tally_submission_id:", resp.error);
        return NextResponse.json(
          { ok: false, error: "Failed to resolve tally_submission_id" },
          { status: 500 }
        );
      }
      if (!resp?.data?.length) {
        return NextResponse.json(
          { ok: false, error: `Submission not found for tally_submission_id=${tallyShort}` },
          { status: 404 }
        );
      }
      submissionId = resp.data[0].id;
      console.log("[API] Resolved tally_submission_id → submissionId:", submissionId);
    }

    if (!submissionId) {
      return NextResponse.json(
        { ok: false, error: "submissionId required (or provide tally_submission_id)" },
        { status: 400 }
      );
    }

    // --- DEBUG: print latest submissions
    const debug = await supabaseAdmin
      .from("submissions")
      .select("id,tally_submission_id,user_email,created_at")
      .order("created_at", { ascending: false })
      .limit(5);
    console.log("[API] DEBUG submissions (latest 5):", debug.data);

    // --- Retry fetch for submissionRow (handles lag)
    let submissionRow: Record<string, any> | null = null;
    for (let i = 0; i < 7; i++) {
      const isUUID =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          submissionId
        );

      let query = supabaseAdmin
        .from("submissions")
        .select("id,user_id,user_email,tally_submission_id,summary")
        .limit(1);

      query = isUUID
        ? query.eq("id", submissionId)
        : query.eq("tally_submission_id", submissionId);

      const resp: any = await query;
      if (!resp?.error && resp?.data?.length) {
        submissionRow = resp.data[0];
        if (submissionRow?.id) submissionId = submissionRow.id;
        break;
      }
      await new Promise((res) => setTimeout(res, 400));
    }
    console.log("[API] Loaded submissionRow:", submissionRow);

    if (!submissionRow) {
      // 🔄 Likely race condition → return 503 instead of 404
      return NextResponse.json(
        { ok: false, error: `Submission not ready yet for id=${submissionId}` },
        { status: 503 }
      );
    }

    // 1) Generate stack with OpenAI
    const {
      markdown,
      raw,
    }: { markdown: string | null; raw: any } = (await generateStackForSubmission(
      submissionId
    )) as any;

    // 2) Pull user_email directly from submissionRow
    const userEmail = (submissionRow.user_email || "").toString();
    if (!userEmail) {
      return NextResponse.json(
        { ok: false, error: "No user_email found in submission row." },
        { status: 500 }
      );
    }

    // 2b) Resolve user_id if possible
    let userId: string | null = submissionRow?.user_id ?? null;
    if (!userId && userEmail) {
      const uResp: any = await supabaseAdmin
        .from("users")
        .select("id")
        .eq("email", userEmail)
        .limit(1);
      if (!uResp?.error && uResp?.data?.length) {
        userId = uResp.data[0].id;
      }
    }

    // 3) Parse items from Markdown
    const markdownForParsing =
      (raw &&
        (raw?.sections?.raw?.output_text || raw?.sections?.raw?.text?.content)) ||
      (raw && (raw?.markdown || raw?.raw?.output_text)) ||
      markdown ||
      submissionRow?.summary ||
      "";

    const items = parseMarkdownToItems(String(markdownForParsing || ""));
    console.log("[API] Parsed items from markdown:", items.length);

    // 4) Build stack row
    const stackRow: any = {
      submission_id: submissionId,
      user_id: userId,
      user_email: userEmail,
      version: process.env.OPENAI_MODEL ?? null,
      summary:
        typeof markdownForParsing === "string"
          ? String(markdownForParsing).slice(0, 2000)
          : null,
      items,
      sections: {
        markdown: markdownForParsing ?? null,
        raw: raw ?? null,
        generated_at: new Date().toISOString(),
      },
      notes: null,
      total_monthly_cost: 0,
      tally_submission_id: submissionRow?.tally_submission_id ?? tallyShort ?? null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // 5) Upsert into stacks
    const respSave: any = await supabaseAdmin
      .from("stacks")
      .upsert(stackRow, { onConflict: "submission_id" })
      .select();

    if (respSave?.error) {
      console.error("Failed to persist stack:", respSave.error);
      return NextResponse.json(
        { ok: true, saved: false, error: String(respSave.error?.message ?? respSave.error) },
        { status: 200 }
      );
    }

    const saved = Array.isArray(respSave?.data)
      ? respSave.data[0] ?? null
      : respSave?.data ?? null;

    console.log("[API] Upserted stack row:", saved);

    return NextResponse.json(
      { ok: true, saved: true, stack: saved, ai: { markdown, raw } },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("Unhandled error in generate-stack:", err);
    return NextResponse.json(
      { ok: false, error: String(err?.message ?? err) },
      { status: 500 }
    );
  }
}
