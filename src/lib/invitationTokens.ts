import { createHash, randomBytes } from "node:crypto";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function createInvitationToken(): string {
  return randomBytes(32).toString("base64url");
}

export function isInvitationToken(value: unknown): value is string {
  return typeof value === "string" && TOKEN_PATTERN.test(value);
}

export function hashInvitationToken(token: string): string {
  if (!isInvitationToken(token)) throw new Error("Invalid invitation token");
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function maskInvitationEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "the invited email address";
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"•".repeat(Math.max(3, local.length - visible.length))}@${domain}`;
}
