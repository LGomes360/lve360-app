"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase"; // ✅ use your actual client

type Props = { onReady: (submissionId: string | null) => void };

function getParam(name: string) {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get(name) ?? "";
}

async function waitForSubmissionPoll(tallyId: string, maxMs = 3000) {
  const start = Date.now();
  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
  while (Date.now() - start < maxMs) {
    try {
      const { data, error } = await supabase
        .from("submissions")
        .select("id")
        .eq("tally_submission_id", tallyId)
        .maybeSingle();

      if (error) {
        console.error("Poll error:", error);
        break; // bail out if Supabase rejects
      }

      if (data?.id) return data.id;
    } catch (e) {
      console.error("Poll exception:", e);
      break;
    }
    await sleep(300);
  }
  return null;
}

export default function LatestReadyGate({ onReady }: Props) {
  const [status, setStatus] = useState<"waiting" | "ready">("waiting");
  const [debug, setDebug] = useState<string>("init");

  useEffect(() => {
    const tallyId = getParam("tally_submission_id");
    let channel: ReturnType<typeof supabase.channel> | null = null;

    setDebug(`got tallyId=${tallyId}`);

    if (tallyId) {
      try {
        // Realtime listener
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
              console.log("Realtime INSERT payload:", payload);
              setStatus("ready");
              onReady((payload.new as any)?.id ?? null);
              setDebug("realtime hit");
            }
          )
          .subscribe();

        // Fallback poll
        waitForSubmissionPoll(tallyId, 3000).then((id) => {
          if (id) {
            setStatus("ready");
            onReady(id);
            setDebug("fallback poll hit");
          } else {
            setDebug("poll timeout");
          }
        });
      } catch (e) {
        console.error("Channel setup error:", e);
        setDebug("channel setup error");
      }
    } else {
      setStatus("ready");
      onReady(null);
      setDebug("no tally param");
    }

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [onReady]);

  if (status === "waiting") {
    return (
      <p className="text-sm text-gray-500">
        ⏳ Preparing your data… <em>({debug})</em>
      </p>
    );
  }

  return null;
}
