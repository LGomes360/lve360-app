"use client";

import React from "react";

interface CTAButtonProps {
  children: React.ReactNode;
  href?: string;
  onClick?: () => void;
  variant?: "primary" | "secondary";
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
    "px-6 py-3 rounded-lg font-medium text-center transition-colors";
  const width = fullWidth ? "w-full" : "";

  const variants = {
    primary: "bg-[#06C1A0] text-white hover:bg-[#049b80]",
    secondary:
      "border border-[#041B2D] text-[#041B2D] hover:bg-[#041B2D] hover:text-white",
  };

  const disabledStyles =
    "bg-gray-200 text-gray-500 cursor-not-allowed border border-gray-300";

  const className = `${base} ${width} ${
    disabled ? disabledStyles : variants[variant]
  }`;

  if (href) {
    return (
      <a
        href={disabled ? undefined : href}
        className={className}
        onClick={disabled ? undefined : onClick}
      >
        {children}
      </a>
    );
  }

  return (
    <button
      className={className}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
