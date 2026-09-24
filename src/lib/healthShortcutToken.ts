import "server-only";

import { createHash, randomBytes } from "node:crypto";

const TOKEN_PATTERN = /^lvehs_[A-Za-z0-9_-]{43}$/;

export function createHealthShortcutToken(): string {
  return `lvehs_${randomBytes(32).toString("base64url")}`;
}

export function hashHealthShortcutToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function readHealthShortcutToken(authorization: string | null): string | null {
  const match = /^Bearer\s+(.+)$/i.exec(authorization?.trim() ?? "");
  const token = match?.[1]?.trim() ?? "";
  return TOKEN_PATTERN.test(token) ? token : null;
}
