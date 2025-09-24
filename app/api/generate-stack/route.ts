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

    // --- LOG BODY INPUT ---
    console.log("[API] generate-stack received:", { submissionId, tallyShort });

    // If caller only gave short Tally id, resolve to UUID
    if (!submissionId && tallyShort) {
      try {
        const resp: any = await supabaseAdmin
          .from("submissions")
          .select("id,tally_submission_id,user_email")
          .eq("tally_submission_id", tallyShort)
          .limit(1);

        if (resp?.error) {
          console.error("Error resolving tally_submission_id:", resp.error);
          return NextResponse.json(
            {
              ok: false,
              error: "Failed to resolve tally_submission_id",
              details: String(resp.error?.message ?? resp.error),
            },
            { status: 500 }
          );
        }

        if (!resp?.data?.length) {
          return NextResponse.json(
            {
              ok: false,
              error: `Submission not found for tally_submission_id=${tallyShort}`,
            },
            { status: 404 }
          );
        }

        submissionId = resp.data[0].id;
        console.log("[API] Resolved tally_submission_id → submissionId:", submissionId);
      } catch (err: any) {
        console.error("Unexpected error resolving tally id:", err);
        return NextResponse.json(
          {
            ok: false,
            error: "Failed to resolve tally_submission_id",
            details: String(err),
          },
          { status: 500 }
        );
      }
    }

    if (!submissionId) {
      return NextResponse.json(
        { ok: false, error: "submissionId required (or provide tally_submission_id)" },
        { status: 400 }
      );
    }

    // Load submission row (UUID vs short id safe)
    let submissionRow: Record<string, any> | null = null;
    try {
      const isUUID =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          submissionId
        );

      let query = supabaseAdmin
        .from("submissions")
        .select("id,user_id,user_email,tally_submission_id,summary")
        .limit(1);

      if (isUUID) {
        query = query.eq("id", submissionId);
      } else {
        query = query.eq("tally_submission_id", submissionId);
      }

      const resp: any = await query;
      if (!resp?.error && resp?.data?.length) {
        submissionRow = resp.data[0];
        if (submissionRow?.id) {
          // Normalize to always use UUID
          submissionId = submissionRow.id;
        }
      }
      console.log("[API] Loaded submissionRow:", submissionRow);
    } catch (e) {
      console.warn("Ignored error loading submission:", e);
    }

    // 1) Generate stack with OpenAI
    const {
      markdown,
      raw,
    }: { markdown: string | null; raw: any } = (await generateStackForSubmission(
      submissionId
    )) as any;

    // 2) Determine user_email (only use user_email field!)
    const userEmail = (
      submissionRow?.user_email ?? 
      (raw as any)?.user_email ?? 
      `unknown+${Date.now()}@local`
    ).toString();

    // 2b) Resolve user_id if possible
    let userId: string | null = submissionRow?.user_id ?? null;
    if (!userId && userEmail) {
      try {
        const uResp: any = await supabaseAdmin
          .from("users")
          .select("id")
          .eq("email", userEmail)
          .limit(1);

        if (!uResp?.error && uResp?.data?.length) {
          userId = uResp.data[0].id;
        }
      } catch (e) {
        console.warn("Non-fatal: user lookup by email failed", e);
      }
    }

    // 3) Pick markdown for parsing
    const markdownForParsing =
      (raw &&
        (raw?.sections?.raw?.output_text || raw?.sections?.raw?.text?.content)) ||
      (raw && (raw?.markdown || raw?.raw?.output_text)) ||
      markdown ||
      submissionRow?.summary ||
      "";

    const items = parseMarkdownToItems(String(markdownForParsing || ""));
    console.log("[API] Parsed items from markdown:", items.length);

    // 4) Build stack row (NO "email" field anymore)
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
      tally_submission_id:
        submissionRow?.tally_submission_id ?? (tallyShort ?? null),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // 5) Upsert into stacks, ensure ID is returned
    const respSave: any = await supabaseAdmin
      .from("stacks")
      .upsert(stackRow, { onConflict: "submission_id" })
      .select();

    if (respSave?.error) {
      console.error("Failed to persist stack:", respSave.error);
      return NextResponse.json(
        {
          ok: true,
          saved: false,
          error: String(respSave.error?.message ?? respSave.error),
          ai: { markdown, raw },
        },
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
