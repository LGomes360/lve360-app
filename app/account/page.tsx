"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle, Clock } from "lucide-react";

export default function AccountPage() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);

  // 🧩 Fetch user info
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/account");
        if (!res.ok) throw new Error("Failed to fetch account info");
        const data = await res.json();
        setUser(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // 🧾 Manage billing portal
  async function openBillingPortal() {
    if (!user?.email) return alert("No email found for this account.");
    setPortalLoading(true);
    try {
      const res = await fetch("/api/stripe/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email }),
      });
      const data = await res.json();
      if (data?.url) window.location.href = data.url;
      else alert(data?.error || "Could not open billing portal.");
    } catch (err) {
      console.error("Portal error:", err);
      alert("Error opening billing portal.");
    } finally {
      setPortalLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="w-6 h-6 animate-spin text-purple-600" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col justify-center items-center h-screen text-center">
        <p className="text-gray-600 mb-4">
          Please log in to view your account.
        </p>
        <Button onClick={() => (window.location.href = "/login")}>
          Go to Login
        </Button>
      </div>
    );
  }

  const tierLabel =
    user.tier === "premium"
      ? "Premium"
      : user.tier === "concierge"
      ? "Concierge"
      : "Free";

  const interval =
    user.billing_interval === "annual"
      ? "Annual"
      : user.billing_interval === "monthly"
      ? "Monthly"
      : "—";

  const endDate = user.subscription_end_date
    ? new Date(user.subscription_end_date).toLocaleDateString()
    : null;

  return (
    <main className="p-6 max-w-2xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold text-center text-purple-700 mb-4">
        Your Account
      </h1>

      <Card className="shadow-md bg-gradient-to-r from-purple-50 to-yellow-50">
        <CardContent className="p-6 space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl font-semibold text-purple-800">
                {tierLabel} Plan
              </h2>
              <p className="text-sm text-gray-600">
                Billing interval: <strong>{interval}</strong>
              </p>
              {endDate && (
                <p className="text-sm text-gray-600">
                  Ends on: <strong>{endDate}</strong>
                </p>
              )}
            </div>
            {user.tier === "free" ? (
              <Clock className="text-yellow-500 w-8 h-8" />
            ) : (
              <CheckCircle className="text-green-500 w-8 h-8" />
            )}
          </div>

          <div className="flex justify-end mt-4">
            {user.tier === "free" ? (
              <Button
                className="bg-purple-600 hover:bg-purple-700 text-white"
                onClick={() => (window.location.href = "/upgrade")}
              >
                Upgrade Plan
              </Button>
            ) : (
              <Button
                className="bg-yellow-400 hover:bg-yellow-500 text-purple-900 font-semibold"
                onClick={openBillingPortal}
                disabled={portalLoading}
              >
                {portalLoading ? "Opening..." : "Manage Billing"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
