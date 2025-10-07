"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
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

  // 🧾 Open Stripe billing portal
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

  // 🌀 Loading state
  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="w-6 h-6 animate-spin text-purple-600" />
      </div>
    );
  }

  // 🚪 Not logged in
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

  // 🧾 Derived info
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

  // ✨ Unified LVE360 dashboard look
  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Greeting header (animated, matches dashboard style) */}
      <motion.h1
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-4xl font-extrabold text-center mb-8"
      >
        <span className="bg-gradient-to-r from-[#06C1A0] to-[#7C3AED] bg-clip-text text-transparent">
          Your Account
        </span>
      </motion.h1>

      {/* Main card */}
      <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-xl ring-1 ring-purple-100 p-6 transition space-y-8">
        <Card className="bg-gradient-to-r from-purple-50 to-yellow-50 shadow-md border-0">
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
      </div>
    </div>
  );
}
