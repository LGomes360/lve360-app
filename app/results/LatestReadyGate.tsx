"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient"; // ✅ matches your repo map

type Props = { onReady: (submissionId: string | null) => void };

// Define the shape of what we expect from the `submissions` table
type SubmissionRow = {
  id: string;
  tally_submission_id: string;
};

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
    const { data } = await supabase
      .from<SubmissionRow>("submissions") // ✅ tell TS what’s inside
      .select("id")
      .eq("tally_submission_id", tallyId)
      .maybeSingle();

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
      // Subscribe for realtime inserts
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
            const id = (payload.new as SubmissionRow).id;
            setStatus("ready");
            onReady(id);
          }
        )
        .subscribe();

      // Fallback poll
      waitForSubmissionPoll(tallyId, 3000).then((id) => {
        if (id) {
          setStatus("ready");
          onReady(id);
        }
      });
    } else {
      // No tallyId? Allow button anyway
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
        Preparing your data…
      </button>
    );
  }
  return null;
}
