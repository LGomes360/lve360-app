import { redirect } from "next/navigation";
import { LEGACY_AUTHENTICATED_REDIRECTS } from "@/lib/authenticatedNavigation";

export default function LegacyMyQuizPage() {
  redirect(LEGACY_AUTHENTICATED_REDIRECTS["/dashboard/my-quiz"]);
}
