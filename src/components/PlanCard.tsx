"use client";

import CTAButton from "./CTAButton";

interface PlanCardProps {
  title: string;
  description: string;
  price: string;
  variant?: "free" | "premium" | "concierge";
  badge?: string;
  buttonText: string;
  buttonAction?: () => void;
  buttonHref?: string;
  disabled?: boolean;
}

export default function PlanCard({
  title,
  description,
  price,
  variant,
  badge,
  buttonText,
  buttonAction,
  buttonHref,
  disabled = false,
}: PlanCardProps) {
  return (
    <div
      className={`relative rounded-xl p-8 shadow-sm flex flex-col border ${
        variant === "premium" ? "border-2 border-[#06C1A0] shadow-md" : "border-gray-200"
      }`}
    >
      {badge && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#06C1A0] text-white px-3 py-1 rounded-full text-sm font-medium">
          {badge}
        </div>
      )}

      <h2 className="text-2xl font-semibold mb-4 text-[#041B2D]">{title}</h2>
      <p className="text-gray-600 mb-6">{description}</p>
      <p className="text-3xl font-bold mb-6 text-[#041B2D]">{price}</p>

      <div className="mt-auto">
        <CTAButton
          onClick={buttonAction}
          href={buttonHref}
          disabled={disabled}
          variant={variant === "free" ? "secondary" : "primary"}
          fullWidth
        >
          {buttonText}
        </CTAButton>
      </div>
    </div>
  );
}
