"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase"; // ✅ matches your repo structure

type Props = {
  onReady: (submissionId: string | null) => void;
};

function getParam(name: string) {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get(name) ?? "";
}

async function waitForSubmissionPoll(
  tallyId: string,
  maxMs = 4000
): Promise<string | null> {
  const start = Date.now();
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  while (Date.now() - start < maxMs) {
    const { data, error } = await supabase
      .from("submissions")
      .select("id")
      .eq("tally_submission_id", tallyId)
      .maybeSingle();

    if (error) {
      console.warn("Polling error:", error);
    }

    if (data?.id) {
      return data.id;
    }
    await sleep(300);
  }
  return null;
}

export default function LatestReadyGate({ onReady }: Props) {
  const [status, setStatus] = useState<"waiting" | "ready">("waiting");

  useEffect(() => {
    const tallyId = getParam("tally_submission_id");
    let channel: ReturnType<typeof supabase.channel> | null = null;

    if (tallyId) {
      // 🔔 Subscribe for realtime INSERT events
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
            const newId = (payload.new as any)?.id ?? null;
            console.log("[Realtime] Got new submission:", newId);
            setStatus("ready");
            onReady(newId);
          }
        )
        .subscribe();

      // ⏱ fallback poll in case webhook hit before we subscribed
      waitForSubmissionPoll(tallyId).then((id) => {
        if (id) {
          console.log("[Poll] Found existing submission:", id);
          setStatus("ready");
          onReady(id);
        }
      });
    } else {
      // No tallyId param: unlock immediately
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

  return null; // ✅ once ready, just disappears (button handled in page)
}
