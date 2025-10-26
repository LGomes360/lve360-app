// server component wrapper — declares page options safely
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = false;

import SuccessClient from "./SuccessClient";

export default function UpgradeSuccessPage() {
  return <SuccessClient />;
}
