"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const MEMBER_ROUTE_PREFIXES = [
  "/today",
  "/routine",
  "/journey",
  "/blueprints",
  "/settings",
  "/onboarding",
  "/results/premium",
];

function isMemberRoute(pathname: string): boolean {
  return MEMBER_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export function PublicSiteHeader() {
  const pathname = usePathname();
  if (isMemberRoute(pathname)) return null;

  return (
    <header className="absolute left-0 top-0 z-40 w-full">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Link href="/" className="text-xl font-extrabold tracking-tight text-purple-600">
          LVE360
        </Link>
        <div className="flex items-center space-x-6 text-sm sm:text-base">
          <Link href="/" className="transition-colors hover:text-purple-600">Home</Link>
          <Link href="/pricing" className="transition-colors hover:text-purple-600">Pricing</Link>
          <Link
            href="/login"
            className="rounded-lg bg-purple-600 px-3 py-1.5 font-medium text-white shadow-sm transition-colors hover:bg-purple-700"
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
