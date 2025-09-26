"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";  // ← adjust if your client file is named differently

type Props = { onReady: (submissionId: string | null) => void };

function getParam(name: string) {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get(name) ?? "";
}

async function waitForSubmissionPoll(tallyId: string, maxMs = 7000) {
  const start = Date.now();
  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
  while (Date.now() - start < maxMs) {
    const { data } = await supabase
      .from("submissions")
      .select("id")
      .eq("tally_submission_id", tallyId)
      .maybeSingle();
    if (data?.id) return data.id;
    await sleep(300);
  }
  return null;
}

export default function LatestReadyGate({ onReady }: Props) {
  const [status, setStatus] = useState<"waiting" | "ready">("waiting");

  useEffect(() => {
    const tallyId = getParam("tally_submission_id");
    if (!tallyId) {
      setStatus("ready");
      onReady(null);
      return;
    }

    // 1) Realtime doorbell (fires when the INSERT arrives)
    const channel = supabase
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
          const id = (payload.new as any)?.id ?? null;
          setStatus("ready");
          onReady(id);
        }
      )
      .subscribe();

    // 2) Fallback: short poll in case webhook beat the subscription
    waitForSubmissionPoll(tallyId, 7000).then((id) => {
      if (status === "ready") return; // already flipped via realtime
      setStatus("ready");
      onReady(id); // may be null; server API will still wait briefly
    });

    return () => {
      supabase.removeChannel(channel);
    };
  }, []); // run once on mount

  if (status === "waiting") {
    return (
      <button disabled className="opacity-60">
        Preparing your data…
      </button>
    );
  }
  return null;
}
