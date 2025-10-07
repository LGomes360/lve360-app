"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ClientDashboard from "@/components/ClientDashboard";
import LongevityJourneyDashboard from "@/components/LongevityJourneyDashboard";

export default function DashboardClientView({
  username,
  userId,
}: {
  username: string;
  userId: string;
}) {
  const [showGreeting, setShowGreeting] = useState(true);

  // fade-in greeting for 4 seconds
  useEffect(() => {
    const timer = setTimeout(() => setShowGreeting(false), 4000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Animated greeting */}
      <AnimatePresence>
        {showGreeting && (
          <motion.h1
            key="greeting"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.5 }}
            className="text-4xl font-extrabold text-center mb-8"
          >
            Welcome back,{" "}
            <span className="bg-gradient-to-r from-[#06C1A0] to-[#7C3AED] bg-clip-text text-transparent">
              {username}
            </span>{" "}
            👋
          </motion.h1>
        )}
      </AnimatePresence>

      {/* Main dashboard card */}
      <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-xl ring-1 ring-purple-100 p-6 transition space-y-8">
        {/* Existing core dashboard */}
        <ClientDashboard />

        {/* Longevity Journey / Goals section */}
        <LongevityJourneyDashboard userId={userId} />
      </div>
    </div>
  );
}
