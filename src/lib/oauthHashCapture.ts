/**
 * OAuth hash capture — runs BEFORE Supabase client is created.
 *
 * Only activates on NON-callback pages. If the user lands on /auth/callback,
 * the Callback page handles tokens directly — we don't interfere.
 *
 * For any OTHER page with hash tokens (edge case: OAuth returns to root),
 * we capture and clear the hash so the Supabase SDK doesn't try PKCE.
 */

export interface CapturedTokens {
  access_token: string;
  refresh_token: string;
}

let captured: CapturedTokens | null = null;

if (typeof window !== "undefined") {
  const isCallbackPage = window.location.pathname === "/auth/callback";

  // Only intercept hash on non-callback pages
  if (!isCallbackPage) {
    const hash = window.location.hash;
    if (hash && hash.includes("access_token=")) {
      const params = new URLSearchParams(hash.replace(/^#/, ""));
      const accessToken = params.get("access_token");
      const refreshToken = params.get("refresh_token");

      if (accessToken && refreshToken) {
        captured = { access_token: accessToken, refresh_token: refreshToken };
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
      }
    }
  }
}

export function consumeOAuthHashTokens(): CapturedTokens | null {
  const tokens = captured;
  captured = null;
  return tokens;
}
