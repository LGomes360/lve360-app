"use client";

import { useEffect, useState } from "react";

export interface ToastProps {
  message: string;
  type?: "success" | "error" | "warning" | "info";
  duration?: number; // in ms, default 5000
  onClose?: () => void;
}

export default function Toast({
  message,
  type = "info",
  duration = 5000,
  onClose,
}: ToastProps) {
  const [visible, setVisible] = useState(true);
  const [animation, setAnimation] = useState<"in" | "out">("in");

  // Auto-hide after `duration`
  useEffect(() => {
    const timer = setTimeout(() => handleClose(), duration);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleClose = () => {
    setAnimation("out");
    setTimeout(() => {
      setVisible(false);
      if (onClose) onClose();
    }, 500); // wait for fade-out
  };

  if (!visible) return null;

  const colorClasses = {
    success: "bg-green-100 border-green-300 text-green-800",
    error: "bg-red-100 border-red-300 text-red-800",
    warning: "bg-yellow-100 border-yellow-300 text-yellow-800",
    info: "bg-blue-100 border-blue-300 text-blue-800",
  };

  return (
    <div
      className={`relative p-4 mb-4 rounded-lg border shadow-sm transition-all ${
        colorClasses[type]
      } ${animation === "in" ? "animate-fade-in-up" : "animate-fade-out-down"}`}
    >
      {message}
      <button
        onClick={handleClose}
        className="absolute right-2 top-2 text-sm opacity-70 hover:opacity-100"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}
