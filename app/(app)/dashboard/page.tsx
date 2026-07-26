import { redirect } from "next/navigation";
import { LEGACY_AUTHENTICATED_REDIRECTS } from "@/lib/authenticatedNavigation";

export default function LegacyDashboardPage() {
  redirect(LEGACY_AUTHENTICATED_REDIRECTS["/dashboard"]);
}
