"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";

export default function ResultsPage() {
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ⚡ Replace this with however you pass the submission_id (from session, URL, or props)
  const submissionId = "8c0f3b4a-32e4-4077-a77f-fa83c6650086";

  useEffect(() => {
    async function fetchReport() {
      try {
        setLoading(true);
        const res = await fetch("/api/generate-report", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ submission_id: submissionId }),
        });

        if (!res.ok) {
          throw new Error(`API error ${res.status}`);
        }

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

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-6">Your LVE360 Concierge Report</h1>

      {loading && <p className="text-gray-500">Generating your report...</p>}
      {error && <p className="text-red-600">❌ {error}</p>}

      {report && (
        <div className="prose prose-lg">
          <ReactMarkdown>{report}</ReactMarkdown>
        </div>
      )}
    </div>
  );
}
