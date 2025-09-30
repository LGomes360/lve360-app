"use client";

import React from "react";
import clsx from "clsx";

export interface CTAButtonProps {
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
  iconOnly?: boolean;
  className?: string;
}

export default function CTAButton({
  children,
  href,
  onClick,
  variant = "primary",
  size = "md",
  fullWidth = false,
  disabled = false,
  iconOnly = false,
  className,
}: CTAButtonProps) {
  const base =
    "rounded-lg font-medium text-center transition-colors duration-200 flex items-center justify-center";

  const sizes: Record<NonNullable<CTAButtonProps["size"]>, string> = {
    sm: "px-3 py-1.5 text-sm min-w-[100px]",
    md: "px-6 py-3 text-base min-w-[200px]",
    lg: "px-8 py-4 text-lg min-w-[240px]",
  };

  const width = fullWidth ? "w-full" : "";

  const variants: Record<NonNullable<CTAButtonProps["variant"]>, string> = {
    primary: "bg-[#06C1A0] text-white hover:bg-[#049b80] shadow-md",
    secondary:
      "border border-[#041B2D] text-[#041B2D] hover:bg-[#041B2D] hover:text-white shadow-sm",
    disabled:
      "bg-gray-200 text-gray-500 cursor-not-allowed border border-gray-300",
    concierge:
      "bg-black text-[#D4AF37] border border-[#D4AF37] hover:bg-[#D4AF37] hover:text-black shadow-md",
    premium:
      "bg-gradient-to-r from-purple-600 to-indigo-800 text-white shadow-md hover:opacity-90",
    gradient:
      "bg-gradient-to-r from-[#06C1A0] to-emerald-500 text-white shadow-md hover:opacity-90",
    subtle:
      "border border-gray-300 text-gray-700 bg-gradient-to-r from-gray-50 to-white hover:from-white hover:to-gray-50 shadow-sm",
  };

  const finalClassName = clsx(
    base,
    sizes[size],
    width,
    variants[variant],
    iconOnly && "rounded-full p-0 w-12 h-12 flex items-center justify-center",
    className
  );

  if (href) {
    return (
      <a
        href={href}
        target="_blank"                // ✅ always open in new tab
        rel="noopener noreferrer"      // ✅ security best practice
        className={finalClassName}
        onClick={onClick}
      >
        {children}
      </a>
    );
  }

  return (
    <button
      className={finalClassName}
      onClick={onClick}
      disabled={disabled || variant === "disabled"}
    >
      {children}
    </button>
  );
}
