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
    "px-6 py-3 rounded-lg font-medium text-center transition-colors duration-200 shadow-md";
  const width = fullWidth ? "w-full" : "";

  const variants: Record<string, string> = {
    primary: "bg-brand text-white hover:bg-brand-dark",
    secondary:
      "border border-brand-dark text-brand-dark hover:bg-brand-dark hover:text-white",
    disabled:
      "bg-gray-200 text-gray-500 cursor-not-allowed border border-gray-300",
    concierge:
      "bg-black text-gold border border-gold hover:bg-gold hover:text-black shadow-luxury",
    premium:
      "bg-gradient-to-r from-gold-light via-gold to-gold-dark text-white font-semibold shadow-premium hover:from-gold-dark hover:to-gold-dark",
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
