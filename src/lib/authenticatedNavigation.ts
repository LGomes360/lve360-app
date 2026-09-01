export const PAID_PRIMARY_NAV_ITEMS = [
  { href: "/today", label: "Today" },
  { href: "/plan", label: "Plan" },
  { href: "/journey", label: "Journey" },
] as const;

export const PAID_SECONDARY_NAV_ITEMS = [
  { href: "/routine", label: "Routine" },
  { href: "/blueprints", label: "Blueprint archive" },
  { href: "/settings", label: "Settings" },
] as const;

export const AUTHENTICATED_NAV_ITEMS = [
  ...PAID_PRIMARY_NAV_ITEMS,
  ...PAID_SECONDARY_NAV_ITEMS,
] as const;

export const LEGACY_AUTHENTICATED_REDIRECTS = {
  "/dashboard": "/today",
  "/dashboard/my-quiz": "/blueprints",
  "/quiz/premium": "/blueprints",
  "/account": "/settings",
} as const;

export function isAuthenticatedRouteActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
