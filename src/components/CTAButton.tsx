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
}

export default function CTAButton({
  children,
  href,
  onClick,
  variant = "primary",
  fullWidth = false,
  disabled = false,
}: CTAButtonProps) {
  const base =
    "px-6 py-3 rounded-lg font-medium text-center transition-all duration-200 shadow-md";
  const width = fullWidth ? "w-full" : "";

  const variants: Record<string, string> = {
    primary: "bg-[#06C1A0] text-white hover:bg-[#049b80]",
    secondary:
      "border border-[#041B2D] text-[#041B2D] hover:bg-[#041B2D] hover:text-white",
    disabled:
      "bg-gray-200 text-gray-500 cursor-not-allowed border border-gray-300",
    concierge:
      "bg-black text-[#D4AF37] border border-[#D4AF37] hover:bg-[#D4AF37] hover:text-black",
    premium:
      "bg-[#041B2D] text-white hover:from-[#041B2D] hover:to-[#06C1A0] " +
      "hover:bg-gradient-to-r shadow-lg hover:shadow-brand/40 border border-transparent",
  };

  const className = clsx(base, width, variants[variant]);

  if (href) {
    return (
      <a href={href} className={className} onClick={onClick}>
        {children}
      </a>
    );
  }

  return (
    <button
      className={className}
      onClick={onClick}
      disabled={disabled || variant === "disabled"}
    >
      {children}
    </button>
  );
}
