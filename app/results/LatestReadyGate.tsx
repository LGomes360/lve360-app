"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supaClient";

type Props = { onReady: (submissionId: string | null) => void };

function getParam(name: string) {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get(name) ?? "";
}

async function waitForSubmissionPoll(tallyId: string, maxMs = 3000) {
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
    const tallyId = getParam("tally_submission_id"); // <-- matches your URL
    let channel: ReturnType<typeof supabase.channel> | null = null;

    if (tallyId) {
      // Realtime “doorbell”: flips to ready when the row INSERTs
      channel = supabase
        .channel("submissions-watch")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "submissions", filter: `tally_submission_id=eq.${tallyId}` },
          (payload) => {
            setStatus("ready");
            onReady((payload.new as any)?.id ?? null);
          }
        )
        .subscribe();

      // Fallback: if webhook already inserted before subscribe, short poll once
      waitForSubmissionPoll(tallyId, 3000).then((id) => {
        if (id) {
          setStatus("ready");
          onReady(id);
        }
      });
    } else {
      // No param? allow button; server will still backoff if needed
      setStatus("ready");
      onReady(null);
    }

    return () => { if (channel) supabase.removeChannel(channel); };
  }, [onReady]);

  if (status === "waiting") {
    return <button disabled className="opacity-60">Preparing your data…</button>;
  }
  return null; // this component only gates readiness
}
