"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Menu, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

import {
  AUTHENTICATED_NAV_ITEMS,
  isAuthenticatedRouteActive,
} from "@/lib/authenticatedNavigation";

type Props = {
  tier?: "free" | "trial" | "premium";
};

export default function DashboardHeader({ tier = "free" }: Props) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const supabase = createClientComponentClient();
  const [menuOpen, setMenuOpen] = useState(false);

  async function handleSignOut() {
    setMenuOpen(false);
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/90 shadow-[0_2px_12px_rgba(0,0,0,0.04)] backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        <Link
          href="/today"
          className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087F72] focus-visible:ring-offset-2"
          aria-label="LVE360 Today"
        >
          <Image
            src="/icons/lve360-logo.png"
            alt="LVE360"
            width={120}
            height={32}
            className="h-8 w-auto select-none"
            draggable={false}
            priority
          />
        </Link>

        <nav className="hidden items-center gap-1 text-sm font-semibold text-[#041B2D] md:flex" aria-label="Member navigation">
          {AUTHENTICATED_NAV_ITEMS.map((item) => (
            <NavLink key={item.href} href={item.href} pathname={pathname}>
              {item.label}
            </NavLink>
          ))}
          <span className="mx-2 h-6 w-px bg-slate-200" aria-hidden="true" />
          <span className="sr-only">Current plan: {tier}</span>
          <button
            type="button"
            onClick={handleSignOut}
            className="rounded-lg bg-[#087F72] px-3 py-2 text-white transition hover:bg-[#06695F] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087F72] focus-visible:ring-offset-2"
          >
            Sign out
          </button>
        </nav>

        <button
          type="button"
          className="rounded-lg p-2 text-[#041B2D] transition hover:bg-[#EAFBF8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087F72] md:hidden"
          onClick={() => setMenuOpen((open) => !open)}
          aria-label={menuOpen ? "Close member menu" : "Open member menu"}
          aria-expanded={menuOpen}
          aria-controls="member-mobile-navigation"
        >
          {menuOpen ? <X size={24} aria-hidden="true" /> : <Menu size={24} aria-hidden="true" />}
        </button>
      </div>

      <AnimatePresence>
        {menuOpen ? (
          <motion.div
            id="member-mobile-navigation"
            key="mobile-menu"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="border-t border-slate-200 bg-white md:hidden"
          >
            <nav className="mx-auto flex max-w-6xl flex-col gap-1 p-4 text-base font-semibold text-[#041B2D]" aria-label="Mobile member navigation">
              {AUTHENTICATED_NAV_ITEMS.map((item) => (
                <NavLink
                  key={item.href}
                  href={item.href}
                  pathname={pathname}
                  onClick={() => setMenuOpen(false)}
                  mobile
                >
                  {item.label}
                </NavLink>
              ))}
              <button
                type="button"
                onClick={handleSignOut}
                className="mt-2 min-h-11 rounded-xl bg-[#087F72] px-4 py-3 text-left text-white transition hover:bg-[#06695F] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087F72] focus-visible:ring-offset-2"
              >
                Sign out
              </button>
            </nav>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </header>
  );
}

function NavLink({
  href,
  pathname,
  children,
  onClick,
  mobile = false,
}: {
  href: string;
  pathname: string;
  children: React.ReactNode;
  onClick?: () => void;
  mobile?: boolean;
}) {
  const active = isAuthenticatedRouteActive(pathname, href);
  return (
    <Link
      href={href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={[
        "rounded-lg transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087F72] focus-visible:ring-offset-2",
        mobile ? "min-h-11 px-4 py-3" : "px-3 py-2",
        active ? "bg-[#EAFBF8] text-[#06695F]" : "hover:bg-slate-50 hover:text-[#087F72]",
      ].join(" ")}
    >
      {children}
    </Link>
  );
}
