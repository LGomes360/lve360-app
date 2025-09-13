"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function ResultsContent() {
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPremiumUser, setIsPremiumUser] = useState(false);

  const [testMode] = useState(process.env.NODE_ENV !== "production");

  // ✅ Wrapped in Suspense
  const searchParams = useSearchParams();
  const submissionId = searchParams?.get("submission_id") ?? null;

  useEffect(() => {
    if (!submissionId) {
      setError("Missing submission_id in URL");
      setLoading(false);
      return;
    }

    async function fetchUserAndReport() {
      try {
        setLoading(true);

        if (!testMode) {
          const {
            data: { session },
          } = await supabase.auth.getSession();
          if (session?.user?.id) {
            const { data: userRow } = await supabase
              .from("users")
              .select("tier")
              .eq("id", session.user.id)
              .single();
            setIsPremiumUser(userRow?.tier === "premium");
          }
        }

        const res = await fetch("/api/generate-report", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ submission_id: submissionId }),
        });

        if (!res.ok) throw new Error(`API error ${res.status}`);
        const data = await res.json();
        if (data?.body) setReport(data.body);
        else setError("No report body returned");
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchUserAndReport();
  }, [submissionId, testMode]);

  function splitSections(md: string): Record<string, string> {
    const parts = md.split(/^## /gm);
    const sections: Record<string, string> = {};
    for (const part of parts ?? []) {
      if (!part.trim()) continue;
      const [header, ...rest] = part.split("\n");
      sections[header.trim()] = rest.join("\n").trim();
    }
    return sections;
  }

  let sections: Record<string, string> = {};
  if (report) sections = splitSections(report);

  if (!submissionId) {
    return (
      <div className="max-w-xl mx-auto py-12 px-6 text-center">
        <h1 className="text-2xl font-semibold mb-4">No Report Found</h1>
        <p className="text-gray-600 mb-6">
          It looks like you landed here without completing the intake quiz.
          Please start with the quiz to generate your personalized report.
        </p>
        <a
          href="/"
          className="inline-block px-6 py-3 bg-teal-600 text-white rounded-lg hover:bg-teal-700"
        >
          Take the Quiz
        </a>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-6">Your LVE360 Concierge Report</h1>

      {testMode && (
        <div className="mb-6">
          <button
            onClick={() => setIsPremiumUser((prev) => !prev)}
            className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
          >
            Toggle Premium Mode (currently: {isPremiumUser ? "Premium" : "Free"})
          </button>
        </div>
      )}

      {loading && <p className="text-gray-500">Generating your report...</p>}
      {error && <p className="text-red-600">❌ {error}</p>}

      {report && (
        <div className="prose prose-lg space-y-6">
          {/* Always show Sections 1–3 */}
          {[
            "Section 1. Current Analysis",
            "Section 2. Contraindications",
            "Section 3. Bang-for-Buck",
          ].map(
            (sec) =>
              sections[sec] && (
                <section key={sec}>
                  <h2>## {sec}</h2>
                  <ReactMarkdown>{sections[sec]}</ReactMarkdown>
                </section>
              )
          )}

          {/* Premium-only sections */}
          {Object.entries(sections)
            .filter(
              ([header]) =>
                !header.startsWith("Section 1") &&
                !header.startsWith("Section 2") &&
                !header.startsWith("Section 3")
            )
            .map(([header, body]) => (
              <section key={header} className="relative">
                <h2>## {header}</h2>
                {!isPremiumUser ? (
                  <div className="relative">
                    <div className="blur-sm select-none pointer-events-none">
                      <ReactMarkdown>{body}</ReactMarkdown>
                    </div>
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/70">
                      <p className="mb-3 text-gray-700 font-medium">
                        🔒 Unlock this section with LVE360 Premium
                      </p>
                      <a
                        href="/pricing"
                        className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700"
                      >
                        Upgrade Now
                      </a>
                    </div>
                  </div>
                ) : (
                  <ReactMarkdown>{body}</ReactMarkdown>
                )}
              </section>
            ))}
        </div>
      )}
    </div>
  );
}

// ✅ Wrap in Suspense so Next.js 14 is happy
export default function ResultsPageWrapper() {
  return (
    <Suspense fallback={<p className="text-center py-8">Loading report...</p>}>
      <ResultsContent />
    </Suspense>
  );
}
