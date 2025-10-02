"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import LongevityJourneyDashboard from "@/components/LongevityJourneyDashboard";

export default function ClientDashboard() {
  const searchParams = useSearchParams();
  const success = searchParams.get("success");
  const [showBanner, setShowBanner] = useState(!!success);

  // Auto-hide banner after 5s
  useEffect(() => {
    if (showBanner) {
      const timer = setTimeout(() => setShowBanner(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [showBanner]);

  return (
    <div>
      {showBanner && (
        <div className="bg-green-100 border border-green-300 text-green-800 p-4 mb-6 rounded-lg shadow-sm text-center animate-fade-in">
          🎉 Welcome to Premium! Your subscription is now active.
        </div>
      )}

      <LongevityJourneyDashboard />
    </div>
  );
}
