"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";

export default function ResultsPage() {
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ⚡ Replace this with however you pass the submission_id (from session, URL, or props)
  const submissionId = "8c0f3b4a-32e4-4077-a77f-fa83c6650086";

  // ⚡ Replace this with your real subscription check (Supabase, Stripe, etc.)
  const isPremiumUser = false;

  useEffect(() => {
    async function fetchReport() {
      try {
        setLoading(true);
        const res = await fetch("/api/generate-report", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ submission_id: submissionId }),
        });

        if (!res.ok) throw new Error(`API error ${res.status}`);

        const data = await res.json();
        if (data?.body) {
          setReport(data.body);
        } else {
          setError("No report body returned");
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchReport();
  }, [submissionId]);

  // Utility: split markdown by section headers
  function splitSections(md: string): Record<string, string> {
    const parts = md.split(/^## /gm); // split on section headers
    const sections: Record<string, string> = {};
    for (const part of parts) {
      if (!part.trim()) continue;
      const [header, ...rest] = part.split("\n");
      sections[header.trim()] = rest.join("\n").trim();
    }
    return sections;
  }

  let sections: Record<string, string> = {};
  if (report) sections = splitSections(report);

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-6">Your LVE360 Concierge Report</h1>

      {loading && <p className="text-gray-500">Generating your report...</p>}
      {error && <p className="text-red-600">❌ {error}</p>}

      {report && (
        <div className="prose prose-lg space-y-6">
          {/* Always show Sections 1–3 */}
          {["Section 1. Current Analysis", "Section 2. Contraindications", "Section 3. Bang-for-Buck"].map(
            (sec) =>
              sections[sec] && (
                <section key={sec}>
                  <h2>## {sec}</h2>
                  <ReactMarkdown>{sections[sec]}</ReactMarkdown>
                </section>
              )
          )}

          {/* Premium-only content */}
          {!isPremiumUser ? (
            <div className="p-6 bg-gray-100 border rounded-lg text-center">
              <p className="mb-2">
                🔒 Unlock your personalized stack and lifestyle plan by upgrading
                to LVE360 Premium.
              </p>
              <a
                href="/pricing"
                className="inline-block px-4 py-2 bg-teal-600 text-white rounded hover:bg-teal-700"
              >
                Upgrade Now
              </a>
            </div>
          ) : (
            Object.entries(sections)
              .filter(
                ([header]) =>
                  !header.startsWith("Section 1") &&
                  !header.startsWith("Section 2") &&
                  !header.startsWith("Section 3")
              )
              .map(([header, body]) => (
                <section key={header}>
                  <h2>## {header}</h2>
                  <ReactMarkdown>{body}</ReactMarkdown>
                </section>
              ))
          )}
        </div>
      )}
    </div>
  );
}
