import { redirect } from "next/navigation";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

import { loadPrivateAccess } from "@/lib/privateAccess";

export async function requirePrivateAccess(opts?: { next?: string }) {
  const supabase = createServerComponentClient({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const next = opts?.next ? `?next=${encodeURIComponent(opts.next)}` : "";
    redirect(`/login${next}`);
  }

  const access = await loadPrivateAccess(user.id);
  if (!access?.privateAccess) redirect("/access");

  return { user, access };
}
