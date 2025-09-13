"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { createClient } from "@supabase/supabase-js";

// Supabase client (browser safe)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function ResultsPage() {
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPremiumUser, setIsPremiumUser] = useState(false);

  // ⚡ Replace with your submission_id source
  const submissionId = "8c0f3b4a-32e4-4077-a77f-fa83c6650086";

  useEffect(() => {
    async function fetchUserAndReport() {
      try {
        setLoading(true);

        // 1. Get current session
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session?.user?.id) {
          setError("Not logged in");
          return;
        }

        // 2. Fetch user tier
        const { data: userRow, error: userError } = await supabase
          .from("users")
          .select("tier")
          .eq("id", session.user.id)
          .single();

        if (!userError) {
          setIsPremiumUser(userRow?.tier === "premium");
        }

        // 3. Fetch report
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
  }, [submissionId]);

  // Split report into sections
  function splitSections(md: string): Record<string, string> {
    const parts = md.split(/^## /gm);
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
                    {/* Blurred content */}
                    <div className="blur-sm select-none pointer-events-none">
                      <ReactMarkdown>{body}</ReactMarkdown>
                    </div>

                    {/* Overlay upgrade CTA */}
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
