"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import LongevityJourneyDashboard from "@/components/LongevityJourneyDashboard";

export default function ClientDashboard() {
  const searchParams = useSearchParams();
  const success = searchParams?.get("success") ?? null;

  const [showBanner, setShowBanner] = useState(!!success);
  const [animation, setAnimation] = useState<"in" | "out" | null>(
    !!success ? "in" : null
  );

  // Auto-hide banner after 5 seconds
  useEffect(() => {
    if (showBanner) {
      const timer = setTimeout(() => {
        setAnimation("out");
        setTimeout(() => setShowBanner(false), 500); // wait for fade-out to finish
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [showBanner]);

  // Manual dismiss
  const handleDismiss = () => {
    setAnimation("out");
    setTimeout(() => setShowBanner(false), 500);
  };

  return (
    <div>
      {showBanner && (
        <div
          className={`relative bg-green-100 border border-green-300 text-green-800 p-4 mb-6 rounded-lg shadow-sm text-center ${
            animation === "in"
              ? "animate-fade-in-up"
              : animation === "out"
              ? "animate-fade-out-down"
              : ""
          }`}
        >
          🎉 Welcome to Premium! Your subscription is now active.
          <button
            onClick={handleDismiss}
            className="absolute right-2 top-2 text-green-700 hover:text-green-900"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      <LongevityJourneyDashboard />
    </div>
  );
}
