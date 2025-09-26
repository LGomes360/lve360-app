"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

/**
 * Create a tiny browser-only Supabase client right here.
 * This avoids any mismatch with your various lib files.
 * Uses ONLY public env vars.
 */
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    realtime: { params: { eventsPerSecond: 2 } },
  }
);

type Props = { onReady: (submissionId: string | null) => void };

function getParam(name: string) {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get(name) ?? "";
}

async function pollForSubmission(tallyId: string, maxMs = 4000) {
  const start = Date.now();
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  while (Date.now() - start < maxMs) {
    const { data, error } = await supabase
      .from("submissions")
      .select("id")
      .eq("tally_submission_id", tallyId)
      .maybeSingle();

    if (error) {
      console.warn("[Gate] poll error:", error);
      return null;
    }
    if (data?.id) return data.id;

    await sleep(300);
  }
  return null;
}

export default function LatestReadyGate({ onReady }: Props) {
  const [status, setStatus] = useState<"waiting" | "ready">("waiting");

  useEffect(() => {
    const tallyId = getParam("tally_submission_id");
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function bootstrap() {
      // If no query param, allow immediately
      if (!tallyId) {
        setStatus("ready");
        onReady(null);
        return;
      }

      // 1) Realtime “doorbell” for the insert we care about
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
            console.log("[Gate] realtime insert:", payload);
            setStatus("ready");
            onReady((payload.new as any)?.id ?? null);
          }
        )
        .subscribe((status) => {
          console.log("[Gate] channel status:", status);
        });

      // 2) Fallback short poll (handles cases where webhook beat our subscribe)
      const found = await pollForSubmission(tallyId, 4000);
      if (found) {
        console.log("[Gate] poll found submission:", found);
        setStatus("ready");
        onReady(found);
      }
    }

    bootstrap();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [onReady]);

  // While waiting, show the small note under the buttons area
  if (status === "waiting") {
    return (
      <p className="text-center text-gray-500 mt-3 text-sm animate-pulse">
        🔄 Preparing your data…
      </p>
    );
  }
  return null;
}
