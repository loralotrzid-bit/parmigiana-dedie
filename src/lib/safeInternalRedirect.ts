const FALLBACK = "/home";

/** Accept only same-origin path redirects; protocol-relative paths are external. */
export function safeInternalRedirect(raw: string | null | undefined, fallback = FALLBACK): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return fallback;
  try {
    const url = new URL(raw, "https://rzfood.invalid");
    if (url.origin !== "https://rzfood.invalid") return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
