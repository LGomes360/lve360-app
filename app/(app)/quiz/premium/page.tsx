// app/(app)/quiz/premium/page.tsx
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";

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
  // ✅ build the server client from cookies (no manual URL/KEY)
  const supabase = createServerComponentClient({ cookies });

  // Require auth (or remove redirect if this page is public)
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // (Optional) gate by tier
  const { data: profile } = await supabase
    .from("users")
    .select("tier")
    .eq("id", user.id)
    .maybeSingle<{ tier: string }>();
  if (!profile || !["premium", "trial"].includes(profile.tier)) {
    redirect("/upgrade");
  }

  const { data: stack } = await supabase
    .from("stacks")
    .select(
      "id, submission_id, tally_submission_id, created_at, safety_status, summary, sections"
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<StackRow>();

  return (
    <main className="max-w-5xl mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-4">My Quiz – Premium Results</h1>
      {!stack ? (
        <p>No previous results found.</p>
      ) : (
        <pre className="rounded bg-gray-50 p-4 overflow-auto text-sm">
          {JSON.stringify(stack, null, 2)}
        </pre>
      )}
    </main>
  );
}
