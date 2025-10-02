"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import LongevityJourneyDashboard from "@/components/LongevityJourneyDashboard";

export default function ClientDashboard() {
  const searchParams = useSearchParams();
  const success = searchParams?.get("success") ?? null;
  const [showBanner, setShowBanner] = useState(!!success);
  const [fadeOut, setFadeOut] = useState(false);

  // Auto-hide after 5s
  useEffect(() => {
    if (showBanner) {
      const timer = setTimeout(() => {
        setFadeOut(true);
        setTimeout(() => setShowBanner(false), 500); // delay removal until fade completes
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [showBanner]);

  const handleDismiss = () => {
    setFadeOut(true);
    setTimeout(() => setShowBanner(false), 500);
  };

  return (
    <div>
      {showBanner && (
        <div
          className={`relative bg-green-100 border border-green-300 text-green-800 p-4 mb-6 rounded-lg shadow-sm text-center transition-opacity duration-500 ${
            fadeOut ? "opacity-0" : "opacity-100"
          }`}
        >
          🎉 Welcome to Premium! Your subscription is now active.
          {/* Dismiss button */}
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
