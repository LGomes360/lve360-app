"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { createClient } from "@supabase/supabase-js";
import CTAButton from "@/components/CTAButton";

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

  // --- Fallback UI if submission_id missing ---
  if (!submissionId) {
    return (
      <div className="max-w-xl mx-auto py-12 px-6 text-center">
        <h1 className="text-2xl font-semibold mb-4 text-[#041B2D]">
          No Report Found
        </h1>
        <p className="text-gray-600 mb-6">
          It looks like you landed here without completing the intake quiz.
          Please start with the quiz to generate your personalized report.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <CTAButton href="https://tally.so/r/mOqRBk" variant="primary">
            Take the Quiz
          </CTAButton>
          <CTAButton href="/" variant="secondary">
            Back to Home
          </CTAButton>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-6 text-[#041B2D]">
        Your LVE360 Concierge Report
      </h1>

      {testMode && (
        <div className="mb-6">
          <CTAButton
            onClick={() => setIsPremiumUser((prev) => !prev)}
            variant="secondary"
          >
            Toggle Premium Mode (currently: {isPremiumUser ? "Premium" : "Free"})
          </CTAButton>
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
                  <h2 className="text-[#041B2D]">## {sec}</h2>
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
                <h2 className="text-[#041B2D]">## {header}</h2>

                {!isPremiumUser ? (
                  <div className="relative">
                    <div className="blur-sm select-none pointer-events-none">
                      <ReactMarkdown>{body}</ReactMarkdown>
                    </div>
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/70">
                      <p className="mb-3 text-[#041B2D] font-medium">
                        🔒 Unlock this section with LVE360 Premium
                      </p>
                      <CTAButton href="/pricing" variant="primary">
                        Upgrade Now
                      </CTAButton>
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
