import { requireTier } from "@/app/_auth/requireTier";

import OnboardingHandoffClient from "./OnboardingHandoffClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function OnboardingPage() {
  await requireTier(["premium", "trial"], { next: "/onboarding" });
  return <OnboardingHandoffClient />;
}
