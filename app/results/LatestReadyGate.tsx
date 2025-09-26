"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient"; // ✅ correct for browser

type Props = { onReady: (submissionId: string | null) => void };

function getParam(name: string) {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get(name) ?? "";
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

    // Listen for INSERT on submissions
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

    // Fallback: short poll in case row already exists
    (async () => {
      const { data } = await supabase
        .from("submissions")
        .select("id")
        .eq("tally_submission_id", tallyId)
        .maybeSingle();

      if (data?.id) {
        setStatus("ready");
        onReady(data.id);
      }
    })();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [onReady]);

  if (status === "waiting") {
    return (
      <button disabled className="opacity-60">
        ⏳ Preparing your data…
      </button>
    );
  }
  return null;
}
