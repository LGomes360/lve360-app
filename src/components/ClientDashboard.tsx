"use client";

import { useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";
import LongevityJourneyDashboard from "@/components/LongevityJourneyDashboard";
import Toast from "@/components/ui/Toast";

// 🔑 helper: call our new /api/stripe/portal endpoint
async function openPortal(email: string) {
  const res = await fetch("/api/stripe/portal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  const data = await res.json();
  if (data.url) {
    window.location.href = data.url;
  } else {
    alert(data.error || "Error opening subscription portal");
  }
}

export default function ClientDashboard() {
  const searchParams = useSearchParams();
  const success = searchParams?.get("success") ?? null;

  const [showToast, setShowToast] = useState(!!success);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    if (success) setShowToast(true);
    // 📨 Grab email from localStorage/session if you store it after login
    const storedEmail = localStorage.getItem("user_email");
    if (storedEmail) setUserEmail(storedEmail);
  }, [success]);

  return (
    <div className="p-6 space-y-6">
      {showToast && (
        <Toast
          message="🎉 Welcome to Premium! Your subscription is now active."
          type="success"
          duration={5000}
          onClose={() => setShowToast(false)}
        />
      )}

      <LongevityJourneyDashboard />

      {/* Manage Subscription Button */}
      {userEmail && (
        <div className="mt-8 text-center">
          <button
            onClick={() => openPortal(userEmail)}
            className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700"
          >
            Manage Subscription
          </button>
        </div>
      )}
    </div>
  );
}
