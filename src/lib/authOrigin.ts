import { safeInternalRedirect } from "@/lib/safeInternalRedirect";

const DEFAULT_AUTH_ORIGIN = "https://rz-food.com";

function safeOrigin(rawOrigin: string): string {
  try {
    return new URL(rawOrigin).origin;
  } catch {
    return DEFAULT_AUTH_ORIGIN;
  }
}

export function getAuthOrigin(currentOrigin?: string): string {
  const fallbackOrigin = typeof window !== "undefined"
    ? window.location.origin
    : DEFAULT_AUTH_ORIGIN;

  return safeOrigin(currentOrigin ?? fallbackOrigin);
}

export function buildAuthCallbackUrl(redirectPath: string): string {
  const safeRedirect = safeInternalRedirect(redirectPath);
  return `${getAuthOrigin()}/auth/callback?redirect=${encodeURIComponent(safeRedirect)}`;
}

// Kept for backward compatibility with existing imports.
export function maybeRedirectToCanonicalAuthOrigin(): boolean {
  return false;
}
