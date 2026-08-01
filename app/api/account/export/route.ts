import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

type ExportQuery = {
  label: string;
  table: string;
  column: string;
  value: string;
};

export async function GET() {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id || !user.email) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  const queries: ExportQuery[] = [
    { label: "profile", table: "users", column: "id", value: user.id },
    { label: "preferences", table: "user_preferences", column: "user_id", value: user.id },
    { label: "submissions", table: "submissions", column: "user_id", value: user.id },
    { label: "supplements", table: "submission_supplements", column: "user_id", value: user.id },
    { label: "medications", table: "submission_medications", column: "user_id", value: user.id },
    { label: "hormones", table: "submission_hormones", column: "user_id", value: user.id },
    { label: "blueprints", table: "stacks", column: "user_id", value: user.id },
    { label: "stack_items", table: "stacks_items", column: "user_id", value: user.id },
    { label: "goals", table: "goals", column: "user_id", value: user.id },
    { label: "check_ins", table: "logs", column: "user_id", value: user.id },
    { label: "ai_summaries", table: "ai_summaries", column: "user_id", value: user.id },
    { label: "weekly_experiments", table: "weekly_experiments", column: "user_id", value: user.id },
    { label: "weekly_reviews", table: "weekly_experiment_reviews", column: "user_id", value: user.id },
    { label: "practice_completions", table: "daily_practice_completions", column: "user_id", value: user.id },
    { label: "activation_events", table: "activation_events", column: "user_id", value: user.id },
    { label: "intake_events", table: "intake_events", column: "user_id", value: user.id },
    { label: "current_regimen", table: "current_regimen_items", column: "user_id", value: user.id },
    { label: "regimen_dose_events", table: "regimen_dose_events", column: "user_id", value: user.id },
    { label: "product_events", table: "product_events", column: "user_id", value: user.id },
  ];

  const results = await Promise.all(
    queries.map(async ({ label, table, column, value }) => {
      const { data, error } = await admin.from(table).select("*").eq(column, value);
      if (error) throw new Error(`${label}: ${error.message}`);
      return [label, data ?? []] as const;
    })
  ).catch((error) => {
    console.error("[account-export] failed", error instanceof Error ? error.message : error);
    return null;
  });

  if (!results) {
    return NextResponse.json({ ok: false, error: "export_unavailable" }, { status: 500 });
  }

  const resultMap = Object.fromEntries(results) as Record<string, Array<{ id?: string }>>;
  const submissionIds = (resultMap.submissions ?? []).flatMap((row) => row.id ? [row.id] : []);
  const stackIds = (resultMap.blueprints ?? []).flatMap((row) => row.id ? [row.id] : []);
  const linkClickQueries = [
    submissionIds.length ? admin.from("link_clicks").select("*").in("submission_id", submissionIds) : Promise.resolve({ data: [], error: null }),
    stackIds.length ? admin.from("link_clicks").select("*").in("stack_id", stackIds) : Promise.resolve({ data: [], error: null }),
  ];
  const [clicksBySubmission, clicksByStack] = await Promise.all(linkClickQueries);
  if (clicksBySubmission.error || clicksByStack.error) {
    console.error("[account-export] link history failed");
    return NextResponse.json({ ok: false, error: "export_unavailable" }, { status: 500 });
  }
  const linkClicks = [
    ...(clicksBySubmission.data ?? []),
    ...(clicksByStack.data ?? []),
  ].filter((row, index, rows) => rows.findIndex((candidate) => candidate.id === row.id) === index);

  const exportedAt = new Date().toISOString();
  const payload = {
    export_version: "1.0",
    exported_at: exportedAt,
    account_email: user.email,
    data: { ...resultMap, link_clicks: linkClicks },
  };
  const date = exportedAt.slice(0, 10);

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="lve360-data-${date}.json"`,
      "Cache-Control": "private, no-store",
    },
  });
}
