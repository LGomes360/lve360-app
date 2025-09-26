"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Props = { onReady: (submissionId: string | null) => void };

// Row type for submissions table
type SubmissionRow = { id: string };

function getParam(name: string) {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get(name) ?? "";
}

async function waitForSubmissionPoll(
  tallyId: string,
  maxMs = 3000
): Promise<string | null> {
  const start = Date.now();
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  while (Date.now() - start < maxMs) {
    const { data, error } = await supabase
      .from<SubmissionRow>("submissions")
      .select("id")
      .eq("tally_submission_id", tallyId)
      .maybeSingle();

    if (error) {
      console.warn("Poll error:", error);
    }

    if (data?.id) return data.id;
    await sleep(400);
  }
  return null;
}

export default function LatestReadyGate({ onReady }: Props) {
  const [status, setStatus] = useState<"waiting" | "ready">("waiting");

  useEffect(() => {
    const tallyId = getParam("tally_submission_id");
    let channel: ReturnType<typeof supabase.channel> | null = null;

    if (tallyId) {
      // Subscribe to realtime insert events
      channel = supabase
        .channel("submissions-watch")
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "submissions",
            filter: `tally_submission_id=eq.${tallyId}`,
          },
          (payload) => {
            const row = payload.new as SubmissionRow;
            setStatus("ready");
            onReady(row.id);
          }
        )
        .subscribe();

      // Poll as fallback in case row was inserted before subscribe
      waitForSubmissionPoll(tallyId, 3000).then((id) => {
        if (id) {
          setStatus("ready");
          onReady(id);
        }
      });
    } else {
      // No tally param? Let it through
      setStatus("ready");
      onReady(null);
    }

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [onReady]);

  if (status === "waiting") {
    return (
      <button disabled className="opacity-60">
        ⏳ Preparing your data…
      </button>
    );
  }

  return null; // disappears when ready
}
