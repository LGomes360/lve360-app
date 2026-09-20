import { requireTier } from "@/app/_auth/requireTier";

import HealthShortcutSetup from "./HealthShortcutSetup";

export const dynamic = "force-dynamic";

export default async function ConnectedHealthSettingsPage() {
  await requireTier(["premium", "trial"], { next: "/settings/connected-health" });
  return <HealthShortcutSetup />;
}
