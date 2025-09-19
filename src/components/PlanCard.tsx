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
  // 🎨 Style by variant
  const borderClass =
    variant === "premium"
      ? "border-2 border-[#06C1A0] shadow-md"
      : variant === "concierge"
      ? "border-2 border-[#D4AF37] shadow-lg bg-gradient-to-b from-white to-[#fffdf5]"
      : "border border-gray-200";

  return (
    <div className={`relative rounded-xl p-8 shadow-sm flex flex-col ${borderClass}`}>
      {badge && (
        <div
          className={`absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-sm font-medium
            ${variant === "concierge" ? "bg-[#D4AF37] text-black" : "bg-[#06C1A0] text-white"}`}
        >
          {badge}
        </div>
      )}

      <h2
        className={`text-2xl font-semibold mb-4 ${
          variant === "concierge" ? "text-[#041B2D]" : "text-[#041B2D]"
        }`}
      >
        {title}
      </h2>
      <p className="text-gray-600 mb-6">{description}</p>
      <p
        className={`text-3xl font-bold mb-6 ${
          variant === "concierge" ? "text-[#D4AF37]" : "text-[#041B2D]"
        }`}
      >
        {price}
      </p>

      <div className="mt-auto">
        <CTAButton
          onClick={buttonAction}
          href={buttonHref}
          disabled={disabled}
          variant={
            variant === "free"
              ? "secondary"
              : "primary" // concierge reuses primary button styling for now
          }
          fullWidth
        >
          {buttonText}
        </CTAButton>
      </div>
    </div>
  );
}
