"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase"; // ✅ matches your repo

type Props = { onReady: (submissionId: string | null) => void };

export default function LatestReadyGate({ onReady }: Props) {
  const [status, setStatus] = useState<"waiting" | "ready">("waiting");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tallyId = params.get("tally_submission_id");
    let channel: ReturnType<typeof supabase.channel> | null = null;

    if (tallyId) {
      // Listen for new submissions
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
            setStatus("ready");
            onReady((payload.new as any)?.id ?? null);
          }
        )
        .subscribe();

      // Fallback quick poll
      const check = async () => {
        const { data } = await supabase
          .from("submissions")
          .select("id")
          .eq("tally_submission_id", tallyId)
          .maybeSingle();
        if (data?.id) {
          setStatus("ready");
          onReady(data.id);
        }
      };
      check();
    } else {
      setStatus("ready");
      onReady(null);
    }

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [onReady]);

  if (status === "waiting") {
    return (
      <button disabled className="opacity-60 text-gray-500 text-sm">
        Preparing your data…
      </button>
    );
  }

  return null; // once ready, nothing to show
}
