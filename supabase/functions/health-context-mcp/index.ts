import { createMcpHandler, McpServer } from "npm:@modelcontextprotocol/server@^2.0.0";
import { pipeline } from "npm:@supabase/middleware@^0.5.0";
import { withOAuthProtectedResource, withSupabase } from "npm:@supabase/server@^1.6.0";
import type { SupabaseClient } from "npm:@supabase/supabase-js@^2.117.2";
import { z } from "npm:zod@^4.3.6";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const summary = z.string().trim().min(1).max(600);
const completeness = z.string().trim().min(1).max(300);
const area = z.strictObject({ summary, data_completeness: completeness });
const overallFeelingArea = z.strictObject({
  summary,
  data_completeness: completeness,
  member_described: z.literal(true).describe(
    "True only when mood, stress, emotional wellbeing, or overall feeling came from the member's own description rather than inference.",
  ),
});
const sourceWindow = z.strictObject({ start: date, end: date });
const labArea = z.strictObject({
  summary,
  data_completeness: completeness,
  result_window: sourceWindow,
  measurement_context: z.string().trim().min(1).max(800).describe(
    "Retain the result units and the source laboratory reference ranges used in the summary.",
  ),
  interpretation_basis: z.literal("source_lab_reference_ranges"),
});

const handoffFields = {
  snapshot_date: date,
  source_window: sourceWindow,
  areas: z.strictObject({
    sleep: area,
    exercise: area,
    diet_weight: area,
    overall_feeling: overallFeelingArea,
    lab_balance: labArea,
  }),
  proposed_focus: z.string().trim().min(1).max(300),
  member_approved: z.literal(true).describe(
    "True only after the member has reviewed the exact five-area summary and explicitly approved sending it to LVE360.",
  ),
};
const handoffBase = z.strictObject(handoffFields);
const handoffInput = handoffBase.superRefine((value, context) => {
  if (value.source_window.start > value.source_window.end || value.source_window.end > value.snapshot_date) {
    context.addIssue({ code: "custom", path: ["source_window"], message: "Source window must end on or before the snapshot date." });
  }
  const labWindow = value.areas.lab_balance.result_window;
  if (labWindow.start > labWindow.end || labWindow.end > value.snapshot_date) {
    context.addIssue({ code: "custom", path: ["areas", "lab_balance", "result_window"], message: "Lab window must end on or before the snapshot date." });
  }
  const summaries = Object.values(value.areas).map((item) => item.summary);
  const prohibitedClinicalContent = /\b(diagnos(?:e|ed|is)|healthy|unhealthy)\b|\b(start|stop|change|increase|decrease|raise|lower)\b.{0,50}\b(medication|medicine|prescription|dose|hormone|supplement)\b|\b(medication|medicine|prescription|dose|hormone|supplement)\b.{0,50}\b(start|stop|change|increase|decrease|raise|lower)\b/i;
  if (summaries.some((item) => prohibitedClinicalContent.test(item))) {
    context.addIssue({ code: "custom", path: ["areas"], message: "Remove diagnoses, healthy/unhealthy labels, and medication or supplement change instructions." });
  }
});

type Handoff = z.infer<typeof handoffInput>;

const app = pipeline(
  [
    withOAuthProtectedResource(),
    withSupabase({
      auth: "user",
      env: {
        publishableKeys: {
          default: Deno.env.get("SUPABASE_PUBLISHABLE_KEY")?.trim()
            || Deno.env.get("SUPABASE_ANON_KEY")?.trim()
            || "",
        },
      },
    }),
  ],
  async (request, { supabase, userClaims }) => {
    const founderUserId = Deno.env.get("LVE360_FOUNDER_USER_ID")?.trim().toLowerCase();
    if (!userClaims || !founderUserId || userClaims.id.toLowerCase() !== founderUserId) {
      return new Response(JSON.stringify({ error: "founder_pilot_only" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    const handler = createMcpHandler(() => {
      const server = new McpServer({ name: "lve360-health-context", version: "0.1.0" });

      server.registerTool(
        "get_lve360_health_handoff_status",
        {
          title: "Check LVE360 health handoff status",
          description: "Confirm that the signed-in founder account is connected and report only the date of the latest approved handoff.",
          inputSchema: z.strictObject({}),
          annotations: { readOnlyHint: true, openWorldHint: false },
        },
        async () => {
          const { data, error } = await supabase
            .from("health_context_handoffs")
            .select("id,snapshot_date,created_at")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (error) throw new Error("LVE360 could not read the handoff status.");
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                connected: true,
                latest_handoff: data
                  ? { id: data.id, snapshot_date: data.snapshot_date, created_at: data.created_at }
                  : null,
              }),
            }],
          };
        },
      );

      server.registerTool(
        "save_lve360_health_context",
        {
          title: "Save an approved health-context summary to LVE360",
          description: [
            "Save one bounded five-area summary only after the member reviews the exact content and explicitly approves the handoff.",
            "Never send raw Apple Health samples, medical records, workout routes, diagnoses, medication changes, or inferred mental-health states.",
            "Lab balance must retain collection dates, units, and the source laboratory reference ranges, and must remain contextual rather than diagnostic.",
          ].join(" "),
          inputSchema: handoffBase,
          annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
        },
        async (input) => saveHandoff(supabase, handoffInput.parse(input)),
      );

      return server;
    });

    return handler.fetch(request);
  },
);

Deno.serve(app);

async function saveHandoff(supabase: SupabaseClient, input: Handoff) {
  const payload = {
    snapshot_date: input.snapshot_date,
    source_window_start: input.source_window.start,
    source_window_end: input.source_window.end,
    sleep_summary: input.areas.sleep.summary,
    sleep_data_completeness: input.areas.sleep.data_completeness,
    exercise_summary: input.areas.exercise.summary,
    exercise_data_completeness: input.areas.exercise.data_completeness,
    diet_weight_summary: input.areas.diet_weight.summary,
    diet_weight_data_completeness: input.areas.diet_weight.data_completeness,
    overall_feeling_summary: input.areas.overall_feeling.summary,
    overall_feeling_data_completeness: input.areas.overall_feeling.data_completeness,
    lab_balance_summary: input.areas.lab_balance.summary,
    lab_balance_data_completeness: input.areas.lab_balance.data_completeness,
    lab_result_window_start: input.areas.lab_balance.result_window.start,
    lab_result_window_end: input.areas.lab_balance.result_window.end,
    lab_measurement_context: input.areas.lab_balance.measurement_context,
    lab_interpretation_basis: input.areas.lab_balance.interpretation_basis,
    proposed_focus: input.proposed_focus,
    member_approved: input.member_approved,
    source: "chatgpt_health",
  };

  const { data, error } = await supabase
    .from("health_context_handoffs")
    .insert(payload)
    .select("id,snapshot_date,created_at")
    .single();
  if (error) throw new Error("LVE360 could not save the approved handoff.");

  // Return metadata only. Health summaries must not be duplicated in transport logs.
  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({ saved: true, id: data.id, snapshot_date: data.snapshot_date, created_at: data.created_at }),
    }],
  };
}
