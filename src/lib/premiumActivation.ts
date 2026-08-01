import "server-only";

import type { User } from "@supabase/supabase-js";

import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export type PremiumActivationProgress = {
  blueprint: {
    status: "connected" | "recoverable" | "missing";
    stackId: string | null;
    createdAt: string | null;
  };
  practice: {
    status: "active" | "draft" | "missing";
  };
  firstActionComplete: boolean;
};

type StackSummary = {
  id: string;
  user_id: string | null;
  submission_id: string | null;
  created_at: string | null;
  sections: unknown;
};

export async function getPremiumActivationProgress(
  user: Pick<User, "id" | "email" | "email_confirmed_at">
): Promise<PremiumActivationProgress> {
  const admin = getSupabaseAdmin();
  const [connectedResult, experimentResult, completionResult] = await Promise.all([
    admin
      .from("stacks")
      .select("id,user_id,submission_id,created_at,sections")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from("weekly_experiments")
      .select("status")
      .eq("user_id", user.id)
      .in("status", ["draft", "active"])
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from("daily_practice_completions")
      .select("id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle(),
  ]);

  if (connectedResult.error) throw connectedResult.error;
  if (experimentResult.error) throw experimentResult.error;
  if (completionResult.error) throw completionResult.error;

  const connected = connectedResult.data as StackSummary | null;
  const recoverable = connected ? null : await findRecoverableBlueprint(user);
  const experimentStatus = experimentResult.data?.status;

  return {
    blueprint: connected
      ? { status: "connected", stackId: connected.id, createdAt: connected.created_at }
      : recoverable
        ? { status: "recoverable", stackId: null, createdAt: recoverable.created_at }
        : { status: "missing", stackId: null, createdAt: null },
    practice: {
      status: experimentStatus === "active"
        ? "active"
        : experimentStatus === "draft"
          ? "draft"
          : "missing",
    },
    firstActionComplete: Boolean(completionResult.data),
  };
}

async function findRecoverableBlueprint(
  user: Pick<User, "id" | "email" | "email_confirmed_at">
): Promise<StackSummary | null> {
  const email = user.email?.trim().toLowerCase();
  if (!email || !user.email_confirmed_at) return null;

  const admin = getSupabaseAdmin();
  const { data: directMatches, error: directError } = await admin
    .from("stacks")
    .select("id,user_id,submission_id,created_at,sections")
    .eq("user_email", email)
    .order("created_at", { ascending: false })
    .limit(10);
  if (directError) throw directError;

  const direct = ((directMatches ?? []) as StackSummary[])
    .find((stack) => stack.user_id !== user.id && !isPremiumBlueprint(stack.sections));
  if (direct) return direct;

  const { data: submissions, error: submissionError } = await admin
    .from("submissions")
    .select("id")
    .eq("user_email", email)
    .order("created_at", { ascending: false })
    .limit(10);
  if (submissionError) throw submissionError;
  const submissionIds = (submissions ?? []).map((submission) => submission.id);
  if (!submissionIds.length) return null;

  const { data: submissionStacks, error: stackError } = await admin
    .from("stacks")
    .select("id,user_id,submission_id,created_at,sections")
    .in("submission_id", submissionIds)
    .order("created_at", { ascending: false })
    .limit(10);
  if (stackError) throw stackError;
  return ((submissionStacks ?? []) as StackSummary[])
    .find((stack) => stack.user_id !== user.id && !isPremiumBlueprint(stack.sections)) ?? null;
}

function isPremiumBlueprint(sections: unknown): boolean {
  return Boolean(sections && typeof sections === "object" && (sections as { mode?: unknown }).mode === "premium");
}
