const ORIGIN = "https://app.lve360.com";
export const FOUNDER_HOME = "/settings/access-requests";
const ALLOWED = new Set([
  "/today", "/journey", "/blueprints", "/settings", "/dashboard",
  "/results", "/account", "/upgrade", "/premium", "/onboarding",
]);

// Routing only. Callers must derive founder status from the verified user ID;
// destination pages retain their own authorization and subscription checks.
export function authDestination(raw: string, founder: boolean): string {
  const home = founder ? FOUNDER_HOME : "/today";
  if (!raw.startsWith("/") || raw.startsWith("//") || /[\\\x00-\x1f]/.test(raw)) return home;
  let target: URL;
  try { target = new URL(raw, ORIGIN); } catch { return home; }
  if (target.origin !== ORIGIN) return home;
  if (target.pathname === FOUNDER_HOME) return home;
  if (!ALLOWED.has(target.pathname)) return home;
  if (founder && ["/today", "/dashboard"].includes(target.pathname)) return home;
  if (target.pathname !== "/upgrade") return target.pathname;
  const plan = target.searchParams.get("plan");
  return plan === "monthly" || plan === "annual" ? `/upgrade?plan=${plan}` : "/upgrade";
}
