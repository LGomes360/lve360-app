"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useProductMode } from "@/components/ProductModeProvider";

const MEMBER_ROUTE_PREFIXES = [
  "/today",
  "/plan",
  "/routine",
  "/journey",
  "/blueprints",
  "/settings",
  "/review",
  "/account",
  "/dashboard",
  "/onboarding",
  "/quiz/premium",
  "/results/premium",
];

function isMemberRoute(pathname: string): boolean {
  return MEMBER_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export function PublicSiteHeader() {
  const pathname = usePathname();
  const { accessMode } = useProductMode();
  if (isMemberRoute(pathname)) return null;

  const inviteOnly = accessMode === "invite_only";

  return (
    <header className="absolute left-0 top-0 z-40 w-full">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Link href="/" className="text-xl font-extrabold tracking-tight text-purple-600">
          LVE360
        </Link>
        <div className="flex items-center gap-3 text-sm sm:gap-6 sm:text-base">
          {inviteOnly ? (
            <>
              <Link href="/#philosophy" className="hidden transition-colors hover:text-teal-700 md:inline">Our philosophy</Link>
              <Link href="/#inside-lve360" className="hidden transition-colors hover:text-teal-700 sm:inline">Inside LVE360</Link>
              <Link href="/#blueprint" className="transition-colors hover:text-teal-700">Blueprint</Link>
              <Link href="/request-invitation" className="hidden transition-colors hover:text-teal-700 lg:inline">Request an invitation</Link>
            </>
          ) : (
            <>
              <Link href="/" className="transition-colors hover:text-purple-600">Home</Link>
              <Link href="/pricing" className="transition-colors hover:text-purple-600">Pricing</Link>
            </>
          )}
          <Link
            href="/login"
            className="rounded-lg bg-[#087F72] px-3 py-1.5 font-medium text-white shadow-sm transition-colors hover:bg-[#06695F]"
          >
            Log in
          </Link>
        </div>
      </nav>
    </header>
  );
}

export function PublicSiteFooter({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (isMemberRoute(pathname)) return null;
  return <>{children}</>;
}
