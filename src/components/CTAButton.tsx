"use client";

import React from "react";
import clsx from "clsx";

interface CTAButtonProps {
  children: React.ReactNode;
  href?: string;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "disabled" | "concierge" | "premium";
  fullWidth?: boolean;
  disabled?: boolean;
  className?: string;
}

export default function CTAButton({
  children,
  href,
  onClick,
  variant = "primary",
  fullWidth = false,
  disabled = false,
  className,
}: CTAButtonProps) {
  const base =
    "inline-flex justify-center items-center px-6 py-3 rounded-xl font-semibold text-center transition-all duration-200 min-w-[200px]";

  const width = fullWidth ? "w-full" : "";

  const variants: Record<string, string> = {
    primary: "bg-[#06C1A0] text-white hover:bg-[#049b80] shadow-md hover:shadow-lg",
    secondary:
      "border border-[#041B2D] text-[#041B2D] hover:bg-[#041B2D] hover:text-white shadow-sm",
    disabled:
      "bg-gray-200 text-gray-500 cursor-not-allowed border border-gray-300",
    concierge:
      "bg-black text-[#D4AF37] border border-[#D4AF37] hover:bg-[#D4AF37] hover:text-black shadow-md hover:shadow-lg",
    premium:
      "bg-gradient-to-r from-yellow-400 to-yellow-600 text-white shadow-lg hover:from-yellow-500 hover:to-yellow-700",
  };

  const classes = clsx(base, width, variants[variant], className);

  if (href) {
    return (
      <a
        href={href}
        className={classes}
        onClick={onClick}
        aria-disabled={disabled || variant === "disabled"}
      >
        {children}
      </a>
    );
  }

  return (
    <button
      className={classes}
      onClick={onClick}
      disabled={disabled || variant === "disabled"}
    >
      {children}
    </button>
  );
}
