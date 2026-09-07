import "server-only";

import { resolveProductMode } from "./productModeConfig";

export function getProductMode() {
  return resolveProductMode(process.env);
}

export function isFounderUser(userId: string | null | undefined): boolean {
  if (!userId) return false;
  const founderUserId = getProductMode().founderUserId;
  return founderUserId !== null && userId.toLowerCase() === founderUserId;
}
