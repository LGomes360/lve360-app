"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import CTAButton from "./CTAButton";

interface ReportSectionProps {
  header: string;
  body: string;
  premiumOnly?: boolean;
  isPremiumUser: boolean;
}

export default function ReportSection({
  header,
  body,
  premiumOnly = false,
  isPremiumUser,
}: ReportSectionProps) {
  return (
    <section key={header} className="relative mb-6">
      <h2 className="text-[#041B2D] text-xl font-semibold mb-2">## {header}</h2>

      {!premiumOnly ? (
        <ReactMarkdown>{body}</ReactMarkdown>
      ) : isPremiumUser ? (
        <ReactMarkdown>{body}</ReactMarkdown>
      ) : (
        <div className="relative">
          <div className="blur-sm select-none pointer-events-none">
            <ReactMarkdown>{body}</ReactMarkdown>
          </div>
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/70">
            <p className="mb-3 text-[#041B2D] font-medium">
              🔒 Unlock this section with LVE360 Premium
            </p>
            <CTAButton href="/pricing" variant="primary">
              Upgrade Now
            </CTAButton>
          </div>
        </div>
      )}
    </section>
  );
}
