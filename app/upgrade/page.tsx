// app/upgrade/page.tsx
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = false;

import UpgradeClient from "./UpgradeClient";

export default function Page() {
  return <UpgradeClient />;
}
