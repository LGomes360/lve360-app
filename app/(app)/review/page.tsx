import { redirect } from "next/navigation";

import { requireTier } from "@/app/_auth/requireTier";
import WeeklyReviewClient from "@/components/review/WeeklyReviewClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function WeeklyReviewPage({ searchParams }: { searchParams: { experiment?: string } }) {
  await requireTier(["premium", "trial"], { next: "/review" });
  if (!searchParams.experiment) redirect("/dashboard");
  return <WeeklyReviewClient experimentId={searchParams.experiment} />;
}
