// app/(app)/dashboard/my-quiz/page.tsx
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import MyQuizClient from "./MyQuizClient";

type StackRow = {
  id: string;
  submission_id: string | null;
  tally_submission_id: string | null;
  created_at: string | null;
  safety_status: "safe" | "warning" | "error" | null;
  summary: string | null;
  sections: any | null;
};

export default async function Page() {
  // Server-side Supabase client (App Router)
  const supabase = createServerComponentClient({ cookies });

  // Require auth (if not logged in, send to /login)
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Fetch latest stack for this user (RLS must allow “own” rows)
  const { data: stack, error } = await supabase
    .from("stacks")
    .select(
      "id, submission_id, tally_submission_id, created_at, safety_status, summary, sections"
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<StackRow>();

  // Optional: log if there’s an error (won’t leak to client)
  if (error) console.error("my-quiz stack fetch error:", error);

  return <MyQuizClient stack={stack ?? null} />;
}
