export type SupplementProductSource = "fullscript" | "fallback" | "member";

const MAX_URL_LENGTH = 2048;
const FULLSCRIPT_IMAGE_HOST = "assets.fullscript.io";

export function normalizeHttpsUrl(value: unknown): string | null {
  if (value === null || value === "") return null;
  if (typeof value !== "string" || value.length > MAX_URL_LENGTH) throw new Error("invalid_reorder_url");
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || !url.hostname) throw new Error("invalid_reorder_url");
    return url.toString();
  } catch {
    throw new Error("invalid_reorder_url");
  }
}

export function normalizeTrustedProductImageUrl(value: unknown): string | null {
  if (value === null || value === "") return null;
  if (typeof value !== "string" || value.length > MAX_URL_LENGTH) throw new Error("invalid_product_image");
  try {
    const url = new URL(value.trim().replaceAll("&amp;", "&"));
    if (url.protocol !== "https:" || url.hostname !== FULLSCRIPT_IMAGE_HOST) throw new Error("invalid_product_image");
    return url.toString();
  } catch {
    throw new Error("invalid_product_image");
  }
}

export function fullscriptImageUrlForSku(sku: unknown): string | null {
  const normalized = typeof sku === "string" ? sku.trim().toUpperCase() : "";
  if (!/^[A-Z]{2}\d{4}$/.test(normalized)) return null;
  return `https://${FULLSCRIPT_IMAGE_HOST}/Product/${normalized}/400_front.png?image_position=1&label=front`;
}

export function isSupplementProductSource(value: unknown): value is SupplementProductSource {
  return value === "fullscript" || value === "fallback" || value === "member";
}
