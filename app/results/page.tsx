// app/results/page.tsx
"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import CTAButton from "@/components/CTAButton";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function ResultsContent() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPremiumUser, setIsPremiumUser] = useState(false);
  const [markdown, setMarkdown] = useState<string | null>(null);

  const reportRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const tallyId = searchParams?.get("tally_submission_id") ?? null;

  // --- Load user tier (skip if no auth) ---
  async function loadUserTier() {
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

  // --- Generate stack (free or premium) ---
  async function generateStack(type: "free" | "premium") {
    if (!tallyId) {
      setError("Missing tally_submission_id in URL");
      return;
    }

    if (type === "premium" && !isPremiumUser) {
      router.push("/pricing");
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const res = await fetch("/api/generate-stack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tally_submission_id: tallyId,
          submission_id: tallyId, // 👈 mirror for safety
          mode: type,
        }),
      });

      if (!res.ok) throw new Error(`Fetch error ${res.status}`);
      const data = await res.json();

      if (data?.ok) {
        const fetchRes = await fetch(
          `/api/get-stack?tally_submission_id=${encodeURIComponent(tallyId)}`
        );
        if (!fetchRes.ok) throw new Error(`Fetch error ${fetchRes.status}`);
        const stackData = await fetchRes.json();

        setMarkdown(
          stackData?.stack?.sections?.markdown ??
            stackData?.stack?.ai?.markdown ??
            stackData?.stack?.summary ??
            null
        );
      } else {
        setError("Generation failed. Please try again.");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // --- Export PDF ---
  async function exportPDF() {
    if (typeof window === "undefined" || !reportRef.current) return;
    try {
      const mod = await import("html2pdf.js");
      const html2pdf = (mod as any).default || (window as any).html2pdf;
      html2pdf()
        .from(reportRef.current)
        .set({
          margin: 0.5,
          filename: "LVE360_Blueprint.pdf",
          html2canvas: { scale: 2 },
          jsPDF: { unit: "in", format: "letter", orientation: "portrait" },
        })
        .save();
    } catch (err) {
      console.error("PDF export failed", err);
      setError("PDF export failed");
    }
  }

  useEffect(() => {
    loadUserTier();
  }, []);

  return (
    <div className="max-w-4xl mx-auto py-10 px-6 animate-fadeIn">
      {/* Header */}
      <div className="text-center mb-10">
        <h1 className="text-4xl font-extrabold font-display text-[#041B2D]">
          Your LVE360 Blueprint
        </h1>
        <p className="text-gray-600 mt-2 font-sans">
          Personalized insights for Longevity • Vitality • Energy
        </p>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-3 justify-center mb-8">
        <CTAButton
          onClick={() => generateStack("free")}
          variant="primary"
          disabled={loading}
        >
          {loading ? "⏳ Generating..." : "✨ Generate Free Report"}
        </CTAButton>

        <CTAButton
          onClick={() => generateStack("premium")}
          variant="premium"
          disabled={loading}
        >
          👑 Upgrade to Premium
        </CTAButton>
      </div>

      {/* Errors */}
      {error && (
        <div className="text-center text-red-600 mb-6">
          <p>{error}</p>
        </div>
      )}

      {/* Report body */}
      <div
        ref={reportRef}
        className="prose prose-lg max-w-none font-sans prose-h2:font-display prose-h2:text-brand-dark prose-strong:text-brand-dark prose-a:text-brand hover:prose-a:underline"
      >
        {markdown ? (
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
        ) : (
          <p className="text-gray-500 text-center">
            🤖 No report yet. Click{" "}
            <span className="font-semibold">Generate Free Report</span> above to
            get your Blueprint!
          </p>
        )}
      </div>

      {/* Export button */}
      <div className="flex justify-center mt-8">
        <CTAButton onClick={exportPDF} variant="secondary">
          📄 Export as PDF
        </CTAButton>
      </div>

      {/* Footer */}
      <footer className="mt-12 pt-6 border-t text-center text-sm text-gray-500">
        Longevity • Vitality • Energy —{" "}
        <span className="font-semibold">LVE360</span> © 2025
      </footer>
    </div>
  );
}

export default function ResultsPageWrapper() {
  return (
    <Suspense fallback={<p className="text-center py-8">Loading...</p>}>
      <ResultsContent />
    </Suspense>
  );
}
