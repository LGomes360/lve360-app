import { requireTier } from "@/app/_auth/requireTier";

import HealthShortcutSetup from "./HealthShortcutSetup";

export const dynamic = "force-dynamic";

function sharedShortcutUrl() {
  const value = process.env.APPLE_HEALTH_SHORTCUT_SHARE_URL?.trim();
  if (!value) return null;

  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "www.icloud.com" || !url.pathname.startsWith("/shortcuts/")) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

export default async function ConnectedHealthSettingsPage() {
  await requireTier(["premium", "trial"], { next: "/settings/connected-health" });
  return <HealthShortcutSetup sharedShortcutUrl={sharedShortcutUrl()} />;
}
