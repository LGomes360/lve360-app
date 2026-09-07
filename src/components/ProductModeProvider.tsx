"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { PublicAccessMode } from "@/lib/productModeConfig";

export type PublicProductMode = Readonly<{
  accessMode: PublicAccessMode;
  publicPricingEnabled: boolean;
  publicSignupEnabled: boolean;
  billingCheckoutEnabled: boolean;
}>;

const DEFAULT_PUBLIC_MODE: PublicProductMode = Object.freeze({
  accessMode: "invite_only",
  publicPricingEnabled: false,
  publicSignupEnabled: false,
  billingCheckoutEnabled: false,
});

const ProductModeContext = createContext<PublicProductMode>(DEFAULT_PUBLIC_MODE);

export function ProductModeProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: PublicProductMode;
}) {
  return <ProductModeContext.Provider value={value}>{children}</ProductModeContext.Provider>;
}

export function useProductMode(): PublicProductMode {
  return useContext(ProductModeContext);
}
