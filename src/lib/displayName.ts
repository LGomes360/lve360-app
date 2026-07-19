type AuthUserLike = {
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
};

export function getFriendlyFirstName(user?: AuthUserLike | null): string {
  const metadata = user?.user_metadata ?? {};
  const candidates = [metadata.given_name, metadata.full_name, metadata.name];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return titleCase(candidate.trim().split(/\s+/)[0]);
  }
  const localPart = (user?.email ?? "").split("@")[0].replace(/[._-]+/g, " ").trim();
  const first = localPart.split(/\s+/)[0]?.replace(/\d+$/, "") || "Optimizer";
  return titleCase(first);
}

function titleCase(value: string) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1).toLowerCase() : "Optimizer";
}
