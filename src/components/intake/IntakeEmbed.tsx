"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

import { trackProductEvent } from "@/lib/productAnalyticsClient";

const FORM_ID = "mOqRBk";
const TALLY_URL = `https://tally.so/embed/${FORM_ID}?alignLeft=1&hideTitle=1&transparentBackground=1&dynamicHeight=1`;

type TallyEvent = {
  event?: string;
  payload?: {
    formId?: string;
    page?: number;
  };
};

function readTallyEvent(data: unknown): TallyEvent | null {
  if (typeof data !== "string" || !data.includes("Tally.")) return null;
  try {
    return JSON.parse(data) as TallyEvent;
  } catch {
    return null;
  }
}

export default function IntakeEmbed({
  className = "min-h-[78vh] w-full bg-white",
  showPrivacyNotice = true,
}: {
  className?: string;
  showPrivacyNotice?: boolean;
}) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const viewedPages = useRef(new Set<number>());

  useEffect(() => {
    function handleTallyMessage(event: MessageEvent) {
      if (event.origin !== "https://tally.so") return;

      if (event.data && typeof event.data === "object" && "height" in event.data) {
        const height = Number((event.data as { height?: unknown }).height);
        if (iframeRef.current && Number.isFinite(height) && height > 0) {
          iframeRef.current.style.height = `${height}px`;
        }
      }

      const tallyEvent = readTallyEvent(event.data);
      if (
        tallyEvent?.event !== "Tally.FormPageView" ||
        tallyEvent.payload?.formId !== FORM_ID
      ) return;

      const page = Number(tallyEvent.payload.page);
      if (!Number.isInteger(page) || page < 1 || page > 6 || viewedPages.current.has(page)) return;
      viewedPages.current.add(page);
      trackProductEvent({ event_name: "intake_page_viewed", source: "tally", step: page });
    }

    window.addEventListener("message", handleTallyMessage);
    return () => window.removeEventListener("message", handleTallyMessage);
  }, []);

  return (
    <div className="bg-white">
      {showPrivacyNotice ? <IntakePrivacyNotice /> : null}
      <iframe
        ref={iframeRef}
        src={TALLY_URL}
        title="LVE360 health and lifestyle intake"
        width="100%"
        height="1100"
        frameBorder="0"
        marginHeight={0}
        marginWidth={0}
        className={className}
      />
    </div>
  );
}

export function IntakePrivacyNotice() {
  return (
    <div className="border-b border-slate-200 bg-slate-50 px-6 py-4 pr-14 text-sm leading-6 text-slate-600">
      <p>
        <strong className="text-slate-900">Why we ask:</strong> Your answers help create your
        personalized Blueprint and identify items that may need clinician or healthcare provider review.
      </p>
      <p className="mt-1">
        We use this information to provide your LVE360 experience. We do not sell your health
        information. Read our{" "}
        <Link className="font-semibold text-teal-700 underline underline-offset-2" href="/privacy">
          Privacy Policy
        </Link>
        ,{" "}
        <Link className="font-semibold text-teal-700 underline underline-offset-2" href="/terms">
          Terms
        </Link>
        , and{" "}
        <Link className="font-semibold text-teal-700 underline underline-offset-2" href="/medical-disclaimer">
          Medical Disclaimer
        </Link>
        .
      </p>
    </div>
  );
}
