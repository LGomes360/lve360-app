// -----------------------------------------------------------------------------
// File: app/results/page.tsx
// LVE360 // Results Page
// Fetches saved stack from /api/get-stack and displays structured items
// with premium gating. Falls back to markdown if items missing.
// -----------------------------------------------------------------------------

"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import CTAButton from "@/components/CTAButton";
import ReportSection from "@/components/ReportSection";
import { sectionsConfig } from "@/config/reportSections";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function ResultsContent() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPremiumUser, setIsPremiumUser] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  const [items, setItems] = useState<any[] | null>(null);
  const [markdown, setMarkdown] = useState<string | null>(null);

  const [testMode] = useState(process.env.NODE_ENV !== "production");
  const searchParams = useSearchParams();
  const submissionId = searchParams?.get("submission_id") ?? null;

  // --- Load user tier (skip in test mode) ---
  async function loadUserTier() {
    if (testMode) return;
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

  // --- Fetch stack from API ---
  async function fetchStack() {
    if (!submissionId) {
      setError("Missing submission_id in URL");
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const res = await fetch(
        `/api/get-stack?submission_id=${encodeURIComponent(submissionId)}`
      );
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await res.json();

      if (data?.ok && data?.stack) {
        const stack = data.stack;
        setItems(stack.items ?? null);
        setMarkdown(
          stack.sections?.markdown ??
            stack.ai?.markdown ??
            stack.summary ??
            null
        );
        setError(null);
      } else {
        setError(data?.error ?? "No stack found");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // --- Regenerate stack on demand ---
  async function regenerateStack() {
    if (!submissionId) return;
    try {
      setRegenerating(true);
      const res = await fetch("/api/generate-stack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submission_id: submissionId }),
      });
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await res.json();
      if (data?.ok && data?.stack) {
        setItems(data.stack.items ?? null);
        setMarkdown(
          data.stack.sections?.markdown ?? data.ai?.markdown ?? null
        );
        setError(null);
      } else {
        setError("Regenerate failed.");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setRegenerating(false);
    }
  }

  useEffect(() => {
    loadUserTier();
    fetchStack();
  }, [submissionId]);

  // --- Split fallback markdown into sections ---
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

  const sections: Record<string, string> = markdown ? splitSections(markdown) : {};

  // --- Fallback if no submission_id ---
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
        <div className="mb-6 flex flex-col gap-2">
          <CTAButton
            onClick={() => setIsPremiumUser((prev) => !prev)}
            variant="secondary"
          >
            Toggle Premium Mode (currently: {isPremiumUser ? "Premium" : "Free"})
          </CTAButton>
          <CTAButton
            onClick={regenerateStack}
            variant="primary"
            disabled={regenerating}
          >
            {regenerating ? "Regenerating..." : "🔄 Regenerate Report"}
          </CTAButton>
        </div>
      )}

      {loading && <p className="text-gray-500">Loading your report...</p>}
      {error && <p className="text-red-600">❌ {error}</p>}

      {/* Render from structured items if available */}
      {items && items.length > 0 ? (
        <div className="space-y-6">
          {items.map((item, idx) => (
            <ReportSection
              key={idx}
              header={item.section ?? `Section ${idx + 1}`}
              body={item.text}
              premiumOnly={false} // TODO: wire premiumOnly if schema supports
              isPremiumUser={isPremiumUser}
            />
          ))}
        </div>
      ) : (
        // Fallback to markdown split by ## headers
        markdown && (
          <div className="prose prose-lg space-y-6">
            {sectionsConfig.map(({ header, premiumOnly }) => {
              if (!sections[header]) return null;

              if (premiumOnly && !isPremiumUser) {
                return (
                  <div
                    key={header}
                    className="border border-gray-200 rounded-lg p-6 bg-gray-50 text-center"
                  >
                    <h2 className="text-xl font-semibold mb-2 text-[#041B2D]">
                      {header}
                    </h2>
                    <p className="text-gray-600 mb-4">
                      This section is available with Premium.
                    </p>
                    <CTAButton href="/pricing" variant="primary">
                      Upgrade to Premium
                    </CTAButton>
                  </div>
                );
              }

              return (
                <ReportSection
                  key={header}
                  header={header}
                  body={sections[header]}
                  premiumOnly={premiumOnly}
                  isPremiumUser={isPremiumUser}
                />
              );
            })}
          </div>
        )
      )}
    </div>
  );
}

export default function ResultsPageWrapper() {
  return (
    <Suspense fallback={<p className="text-center py-8">Loading report...</p>}>
      <ResultsContent />
    </Suspense>
  );
}
