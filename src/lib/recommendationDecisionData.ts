import "server-only";

import type { CurrentRegimenItem } from "@/lib/currentRegimenModel";
import {
  buildRecommendationDecisionSeed,
  type MemberRecommendationDecision,
  type RecommendationDecisionRecord,
  type RecommendationDecisionSeed,
  type RecommendationProposalInput,
} from "@/lib/recommendationDecision";
import { normalizeRegimenName } from "@/lib/currentRegimenModel";
import { isEligibleSupplementName, isMedicationOrHormoneName } from "@/lib/supplementEligibility";
import { extractReportRecommendationProposals } from "@/lib/reportRecommendationProposals";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export type StackRecommendationProposal = RecommendationProposalInput & {
  brand: string | null;
  dose: string | null;
  timing: string | null;
  timing_text: string | null;
  link_amazon: string | null;
  link_fullscript: string | null;
  refill_days_left: number | null;
  last_refilled_at: string | null;
  created_at: string | null;
};

export type StackRecommendationDecision = {
  proposal: StackRecommendationProposal;
  decision: RecommendationDecisionRecord;
};

const DECISION_COLUMNS = "id,stack_id,stack_item_id,recommendation_key,context_fingerprint,status,reason_snapshot,overlap_snapshot,deferred_until,created_at,updated_at";
const PROPOSAL_COLUMNS = "id,stack_id,name,brand,dose,timing,timing_text,notes,rationale,is_current,link_amazon,link_fullscript,refill_days_left,last_refilled_at,created_at";

function isMissingDecisionTable(error: { code?: string; message?: string } | null | undefined): boolean {
  return error?.code === "42P01"
    || error?.code === "PGRST205"
    || /recommendation_decisions.*(?:does not exist|schema cache)/i.test(error?.message ?? "");
}

function fallbackDecision(seed: RecommendationDecisionSeed): RecommendationDecisionRecord {
  const now = new Date().toISOString();
  return {
    id: `pending:${seed.stack_item_id}`,
    ...seed,
    status: "review",
    deferred_until: null,
    created_at: now,
    updated_at: now,
  };
}

function normalizeDecision(row: Record<string, unknown>): RecommendationDecisionRecord {
  return {
    id: String(row.id),
    stack_id: String(row.stack_id),
    stack_item_id: String(row.stack_item_id),
    recommendation_key: String(row.recommendation_key),
    context_fingerprint: String(row.context_fingerprint),
    status: row.status as RecommendationDecisionRecord["status"],
    reason_snapshot: String(row.reason_snapshot ?? ""),
    overlap_snapshot: Array.isArray(row.overlap_snapshot)
      ? row.overlap_snapshot.filter((value): value is string => typeof value === "string")
      : [],
    deferred_until: typeof row.deferred_until === "string" ? row.deferred_until : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export async function getStackRecommendationDecisions(
  userId: string,
  stackId: string,
  currentItems: CurrentRegimenItem[],
  goals: string[],
  reportMarkdown: string,
): Promise<StackRecommendationDecision[]> {
  const admin = getSupabaseAdmin();
  let { data, error } = await admin
    .from("stacks_items")
    .select(PROPOSAL_COLUMNS)
    .eq("stack_id", stackId)
    .eq("user_id", userId)
    .eq("is_current", false);
  if (error) throw error;

  const storedNames = new Set((data ?? []).map((item) => normalizeRegimenName(item.name)));
  const reportProposals = extractReportRecommendationProposals(
    reportMarkdown,
    currentItems.map((item) => item.name),
  ).filter((item) => !storedNames.has(normalizeRegimenName(item.name)));

  if (reportProposals.length) {
    for (const proposal of reportProposals) {
      const { error: insertError } = await admin.from("stacks_items").insert({
        stack_id: stackId,
        user_id: userId,
        name: proposal.name,
        dose: proposal.dose ?? null,
        timing: proposal.timing ?? null,
        timing_text: proposal.timing_text ?? null,
        timing_bucket: proposal.timing_bucket ?? null,
        notes: proposal.notes ?? null,
        rationale: proposal.rationale ?? null,
        is_current: false,
      });
      if (insertError && insertError.code !== "23505") throw insertError;
    }

    const refreshed = await admin
      .from("stacks_items")
      .select(PROPOSAL_COLUMNS)
      .eq("stack_id", stackId)
      .eq("user_id", userId)
      .eq("is_current", false);
    if (refreshed.error) throw refreshed.error;
    data = refreshed.data;
  }

  const currentNames = new Set(currentItems.map((item) => normalizeRegimenName(item.name)));
  const proposals = (data ?? [])
    .filter((item) => {
      const name = typeof item.name === "string" ? item.name.trim() : "";
      return Boolean(
        name
        && isEligibleSupplementName(name)
        && !isMedicationOrHormoneName(name)
        && !currentNames.has(normalizeRegimenName(name))
      );
    })
    .map((item) => ({
      id: item.id,
      stack_id: item.stack_id,
      name: item.name,
      brand: item.brand,
      dose: item.dose,
      timing: item.timing,
      timing_text: item.timing_text,
      notes: item.notes,
      rationale: item.rationale,
      link_amazon: item.link_amazon,
      link_fullscript: item.link_fullscript,
      refill_days_left: item.refill_days_left,
      last_refilled_at: item.last_refilled_at,
      created_at: item.created_at,
    })) as StackRecommendationProposal[];

  if (!proposals.length) return [];

  const seeds = proposals.map((proposal) => buildRecommendationDecisionSeed(proposal, currentItems, goals));
  const { error: upsertError } = await admin.from("recommendation_decisions").upsert(
    seeds.map((seed) => ({ user_id: userId, ...seed })),
    { onConflict: "user_id,recommendation_key,context_fingerprint" },
  );
  if (upsertError && !isMissingDecisionTable(upsertError)) throw upsertError;
  if (upsertError) {
    console.warn("[recommendations] decision migration is not applied yet; using review-only fallback records");
    return proposals.map((proposal, index) => ({ proposal, decision: fallbackDecision(seeds[index]) }));
  }

  const { data: decisions, error: decisionError } = await admin
    .from("recommendation_decisions")
    .select(DECISION_COLUMNS)
    .eq("user_id", userId)
    .in("context_fingerprint", seeds.map((seed) => seed.context_fingerprint));
  if (decisionError) throw decisionError;
  const decisionMap = new Map<string, RecommendationDecisionRecord>(
    (decisions ?? []).map((row) => {
      const decision = normalizeDecision(row as Record<string, unknown>);
      return [`${decision.recommendation_key}:${decision.context_fingerprint}`, decision] as const;
    }),
  );

  return proposals.map((proposal, index) => {
    const seed = seeds[index];
    const key = `${seed.recommendation_key}:${seed.context_fingerprint}`;
    return { proposal, decision: decisionMap.get(key) ?? fallbackDecision(seed) };
  });
}

export async function updateRecommendationDecision(
  userId: string,
  stackItemId: string,
  status: MemberRecommendationDecision | "adopted",
): Promise<RecommendationDecisionRecord | null> {
  const admin = getSupabaseAdmin();
  const { data: current, error: currentError } = await admin
    .from("recommendation_decisions")
    .select("id")
    .eq("user_id", userId)
    .eq("stack_item_id", stackItemId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (currentError) {
    if (isMissingDecisionTable(currentError)) return null;
    throw currentError;
  }
  if (!current?.id) return null;

  const { data, error } = await admin
    .from("recommendation_decisions")
    .update({
      status,
      deferred_until: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", current.id)
    .eq("user_id", userId)
    .select(DECISION_COLUMNS)
    .maybeSingle();
  if (error) {
    if (isMissingDecisionTable(error)) return null;
    throw error;
  }
  return data ? normalizeDecision(data as Record<string, unknown>) : null;
}
