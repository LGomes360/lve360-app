// app/(app)/dashboard/my-quiz/page.tsx
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
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
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (name) => cookieStore.get(name)?.value } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: stack } = await supabase
    .from("stacks")
    .select("id, submission_id, tally_submission_id, created_at, safety_status, summary, sections")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<StackRow>();

  return <MyQuizClient stack={stack ?? null} />;
}
