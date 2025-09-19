"use client";

import React from "react";

interface CTAButtonProps {
  children: React.ReactNode;
  href?: string;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "disabled" | "concierge";
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
    "px-6 py-3 rounded-lg font-medium text-center transition-colors duration-200";
  const width = fullWidth ? "w-full" : "";

  const variants: Record<string, string> = {
    primary: "bg-[#06C1A0] text-white hover:bg-[#049b80]",
    secondary:
      "border border-[#041B2D] text-[#041B2D] hover:bg-[#041B2D] hover:text-white",
    disabled:
      "bg-gray-200 text-gray-500 cursor-not-allowed border border-gray-300",
    concierge:
      "bg-black text-[#D4AF37] border border-[#D4AF37] hover:bg-[#D4AF37] hover:text-black",
  };

  const className = `${base} ${width} ${variants[variant]}`;

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
