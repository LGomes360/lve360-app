import { redirect } from "next/navigation";

import { requireTier } from "@/app/_auth/requireTier";
import WeeklyReviewClient from "@/components/review/WeeklyReviewClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function WeeklyReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ experiment?: string }>;
}) {
  await requireTier(["premium", "trial"], { next: "/review" });
  const { experiment } = await searchParams;
  if (!experiment) redirect("/today");
  return <WeeklyReviewClient experimentId={experiment} />;
}
