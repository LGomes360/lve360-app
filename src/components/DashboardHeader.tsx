"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Menu, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

import {
  AUTHENTICATED_NAV_ITEMS,
  PAID_PRIMARY_NAV_ITEMS,
  PAID_SECONDARY_NAV_ITEMS,
  isAuthenticatedRouteActive,
} from "@/lib/authenticatedNavigation";
import AskLve360Coach from "@/components/coach/AskLve360Coach";

type Props = {
  tier?: "free" | "trial" | "premium";
};

export default function DashboardHeader({ tier = "free" }: Props) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const supabase = createClientComponentClient();
  const [menuOpen, setMenuOpen] = useState(false);
  const [secondaryOpen, setSecondaryOpen] = useState(false);
  const secondaryMenuRef = useRef<HTMLDivElement>(null);
  const secondaryMenuButtonRef = useRef<HTMLButtonElement>(null);
  const paid = tier === "premium" || tier === "trial";
  const navigationItems = paid
    ? PAID_PRIMARY_NAV_ITEMS
    : AUTHENTICATED_NAV_ITEMS.filter((item) => item.href === "/blueprints" || item.href === "/settings");
  const secondaryItems = paid ? PAID_SECONDARY_NAV_ITEMS : [];
  const secondaryActive = secondaryItems.some((item) => isAuthenticatedRouteActive(pathname, item.href));

  useEffect(() => {
    setMenuOpen(false);
    setSecondaryOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!secondaryOpen) return;

    function closeSecondaryMenu(event: PointerEvent | KeyboardEvent) {
      if (event instanceof KeyboardEvent && event.key === "Escape") {
        setSecondaryOpen(false);
        secondaryMenuButtonRef.current?.focus();
        return;
      }
      if (event instanceof PointerEvent && !secondaryMenuRef.current?.contains(event.target as Node)) {
        setSecondaryOpen(false);
      }
    }

    document.addEventListener("pointerdown", closeSecondaryMenu);
    document.addEventListener("keydown", closeSecondaryMenu);
    return () => {
      document.removeEventListener("pointerdown", closeSecondaryMenu);
      document.removeEventListener("keydown", closeSecondaryMenu);
    };
  }, [secondaryOpen]);

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
          href={paid ? "/today" : "/blueprints"}
          className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087F72] focus-visible:ring-offset-2"
          aria-label={paid ? "LVE360 Today" : "LVE360 Blueprints"}
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

        <div className="flex items-center gap-2">
        <nav className="hidden items-center gap-1 text-sm font-semibold text-[#041B2D] md:flex" aria-label="Member navigation">
          {navigationItems.map((item) => (
            <NavLink key={item.href} href={item.href} pathname={pathname}>
              {item.label}
            </NavLink>
          ))}
        </nav>

        {paid ? (
          <div ref={secondaryMenuRef} className="relative hidden md:block">
            <button
              ref={secondaryMenuButtonRef}
              type="button"
              onClick={() => setSecondaryOpen((open) => !open)}
              aria-expanded={secondaryOpen}
              aria-haspopup="true"
              aria-controls="member-secondary-navigation"
              className={[
                "inline-flex items-center rounded-lg px-3 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087F72] focus-visible:ring-offset-2",
                secondaryActive ? "bg-[#EAFBF8] text-[#06695F]" : "text-[#041B2D] hover:bg-slate-50 hover:text-[#087F72]",
              ].join(" ")}
            >
              More
              <ChevronDown className={`ml-1 h-4 w-4 transition ${secondaryOpen ? "rotate-180" : ""}`} aria-hidden="true" />
            </button>
            {secondaryOpen ? (
              <div id="member-secondary-navigation" className="absolute right-0 top-full z-50 mt-2 w-56 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
                <nav className="space-y-1 text-sm font-semibold text-[#041B2D]" aria-label="Member tools and archive">
                  {secondaryItems.map((item) => (
                    <NavLink key={item.href} href={item.href} pathname={pathname} onClick={() => setSecondaryOpen(false)} mobile>
                      {item.label}
                    </NavLink>
                  ))}
                </nav>
              </div>
            ) : null}
          </div>
        ) : null}

        {paid ? <AskLve360Coach /> : null}
        <span className="hidden h-6 w-px bg-slate-200 md:block" aria-hidden="true" />
        <span className="sr-only">Current plan: {tier}</span>
        {!paid ? (
          <Link
            href="/upgrade"
            className="hidden rounded-lg border border-[#6D36C9] px-3 py-2 text-sm font-semibold text-[#6D36C9] transition hover:bg-purple-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6D36C9] focus-visible:ring-offset-2 md:inline-flex"
          >
            Join LVE360
          </Link>
        ) : null}
        <button
          type="button"
          onClick={handleSignOut}
          className="hidden rounded-lg bg-[#087F72] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#06695F] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087F72] focus-visible:ring-offset-2 md:inline-flex"
        >
          Sign out
        </button>

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
              {navigationItems.map((item) => (
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
              {paid ? (
                <div className="mt-2 border-t border-slate-200 pt-3">
                  <p className="px-4 pb-1 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Tools and archive</p>
                  {secondaryItems.map((item) => (
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
                </div>
              ) : null}
              {!paid ? (
                <Link
                  href="/upgrade"
                  onClick={() => setMenuOpen(false)}
                  className="min-h-11 rounded-xl border border-[#6D36C9] px-4 py-3 text-[#6D36C9]"
                >
                  Join LVE360
                </Link>
              ) : null}
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
        mobile ? "block min-h-11 px-4 py-3" : "px-3 py-2",
        active ? "bg-[#EAFBF8] text-[#06695F]" : "hover:bg-slate-50 hover:text-[#087F72]",
      ].join(" ")}
    >
      {children}
    </Link>
  );
}
