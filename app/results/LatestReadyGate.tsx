"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient"; // ✅ browser-safe client

type Props = { onReady: (submissionId: string | null) => void };

function getParam(name: string) {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get(name) ?? "";
}

async function waitForSubmissionPoll(tallyId: string, maxMs = 5000) {
  const start = Date.now();
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  while (Date.now() - start < maxMs) {
    const { data } = await supabase
      .from("submissions")
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
    if (!tallyId) {
      // no tally param → allow button immediately
      setStatus("ready");
      onReady(null);
      return;
    }

    // Subscribe to realtime inserts
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
          setStatus("ready");
          onReady((payload.new as any)?.id ?? null);
        }
      )
      .subscribe();

    // Fallback: short polling in case row was inserted before subscription
    waitForSubmissionPoll(tallyId, 5000).then((id) => {
      if (id) {
        setStatus("ready");
        onReady(id);
      }
    });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [onReady]);

  if (status === "waiting") {
    return (
      <p className="text-sm text-gray-500 animate-pulse">
        ⏳ Preparing your data…
      </p>
    );
  }

  return null; // once "ready", hide the placeholder
}
