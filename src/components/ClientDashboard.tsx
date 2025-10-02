"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import LongevityJourneyDashboard from "@/components/LongevityJourneyDashboard";

export default function ClientDashboard() {
  const searchParams = useSearchParams();
  const success = searchParams?.get("success") ?? null;
  const [showBanner, setShowBanner] = useState(!!success);

  // Auto-hide after 5 seconds
  useEffect(() => {
    if (showBanner) {
      const timer = setTimeout(() => setShowBanner(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [showBanner]);

  return (
    <div>
      {showBanner && (
        <div className="relative bg-green-100 border border-green-300 text-green-800 p-4 mb-6 rounded-lg shadow-sm text-center animate-fade-in">
          🎉 Welcome to Premium! Your subscription is now active.
          {/* Dismiss button */}
          <button
            onClick={() => setShowBanner(false)}
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
