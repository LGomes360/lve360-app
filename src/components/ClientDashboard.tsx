"use client";

import { useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";
import LongevityJourneyDashboard from "@/components/LongevityJourneyDashboard";
import Toast from "@/components/ui/Toast";

// 🔑 helper: call our new /api/stripe/portal endpoint
async function openPortal(email: string, setLoading: (b: boolean) => void) {
  try {
    setLoading(true);
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
  } catch (err: any) {
    console.error("Portal error:", err);
    alert("Something went wrong opening subscription portal.");
  } finally {
    setLoading(false);
  }
}

export default function ClientDashboard({ userId }: { userId: string }) {

  const searchParams = useSearchParams();
  const success = searchParams?.get("success") ?? null;

  const [showToast, setShowToast] = useState(!!success);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [loadingPortal, setLoadingPortal] = useState(false);

  useEffect(() => {
    if (success) setShowToast(true);

    // 📨 Grab email from localStorage if stored after login
    if (typeof window !== "undefined") {
      const storedEmail = localStorage.getItem("user_email");
      if (storedEmail) setUserEmail(storedEmail);
    }
  }, [success]);

  return (
    <div className="p-6 space-y-6">
      {/* Toast for subscription success */}
      {showToast && (
        <Toast
          message="🎉 Welcome to Premium! Your subscription is now active."
          type="success"
          duration={5000}
          onClose={() => setShowToast(false)}
        />
      )}

      {/* Core Dashboard */}
      <LongevityJourneyDashboard userId={userId} />

      {/* Manage Subscription Button */}
      {userEmail && (
        <div className="mt-8 text-center">
          <button
            onClick={() => openPortal(userEmail, setLoadingPortal)}
            disabled={loadingPortal}
            className={`px-4 py-2 rounded-lg text-white ${
              loadingPortal
                ? "bg-purple-400 cursor-not-allowed"
                : "bg-purple-600 hover:bg-purple-700"
            }`}
          >
            {loadingPortal ? "Loading..." : "Manage Subscription"}
          </button>
        </div>
      )}
    </div>
  );
}
