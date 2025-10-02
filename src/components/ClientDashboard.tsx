"use client";

import { useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";
import LongevityJourneyDashboard from "@/components/LongevityJourneyDashboard";
import Toast from "@/components/ui/Toast";

export default function ClientDashboard() {
  const searchParams = useSearchParams();
  const success = searchParams?.get("success") ?? null;

  const [showToast, setShowToast] = useState(!!success);

  useEffect(() => {
    if (success) setShowToast(true);
  }, [success]);

  return (
    <div>
      {showToast && (
        <Toast
          message="🎉 Welcome to Premium! Your subscription is now active."
          type="success"
          duration={5000}
          onClose={() => setShowToast(false)}
        />
      )}

      <LongevityJourneyDashboard />
    </div>
  );
}
