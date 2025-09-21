"use client";

import React from "react";
import clsx from "clsx";

interface CTAButtonProps {
  children: React.ReactNode;
  href?: string;
  onClick?: () => void;
  variant?:
    | "primary"
    | "secondary"
    | "disabled"
    | "concierge"
    | "premium"
    | "gradient"
    | "subtle";
  size?: "sm" | "md" | "lg";
  fullWidth?: boolean;
  disabled?: boolean;
}

export default function CTAButton({
  children,
  href,
  onClick,
  variant = "primary",
  size = "md",
  fullWidth = false,
  disabled = false,
}: CTAButtonProps) {
  // Base + size
  const base =
    "rounded-lg font-medium text-center transition-colors duration-200";
  const sizes: Record<NonNullable<CTAButtonProps["size"]>, string> = {
    sm: "px-3 py-1.5 text-sm min-w-[100px]",
    md: "px-6 py-3 text-base min-w-[200px]",
    lg: "px-8 py-4 text-lg min-w-[240px]",
  };
  const width = fullWidth ? "w-full" : "";

  // Variants
  const variants: Record<NonNullable<CTAButtonProps["variant"]>, string> = {
    primary: "bg-[#06C1A0] text-white hover:bg-[#049b80] shadow-md",
    secondary:
      "border border-[#041B2D] text-[#041B2D] hover:bg-[#041B2D] hover:text-white shadow-sm",
    disabled:
      "bg-gray-200 text-gray-500 cursor-not-allowed border border-gray-300",
    concierge:
      "bg-black text-[#D4AF37] border border-[#D4AF37] hover:bg-[#D4AF37] hover:text-black shadow-md",
    premium:
      "bg-[#041B2D] text-[#FFD700] border border-[#FFD700] hover:bg-[#FFD700] hover:text-[#041B2D] shadow-md",
    gradient:
      "bg-gradient-to-r from-[#06C1A0] to-emerald-500 text-white shadow-md hover:opacity-90",
    subtle:
      "px-4 py-2 text-sm rounded-full border border-gray-300 text-gray-600 hover:bg-gray-100 min-w-0 shadow-sm",
  };

  const className = clsx(base, sizes[size], width, variants[variant]);

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
