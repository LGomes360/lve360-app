export const AUTHENTICATED_NAV_ITEMS = [
  { href: "/today", label: "Today" },
  { href: "/journey", label: "Journey" },
  { href: "/blueprints", label: "Blueprints" },
  { href: "/settings", label: "Settings" },
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
