import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isValidSession } from "@/lib/authSession";
import { ensureClientProfile } from "@/lib/ensureClientProfile";
import { setProfileSeed } from "@/lib/profileSeed";
import { directSelect } from "@/lib/directSupabaseRest";
import { Loader2 } from "lucide-react";
import { dbg } from "@/lib/debugLog";
import { safeInternalRedirect } from "@/lib/safeInternalRedirect";
import type { Session } from "@supabase/supabase-js";

function decodeStateRedirect(raw: string | null): string | null {
  if (!raw || !raw.startsWith("rz:")) return null;
  try {
    const base64url = raw.slice(3);
    const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const decoded = decodeURIComponent(atob(padded));
    return safeInternalRedirect(decoded, "") || null;
  } catch { return null; }
}

function getSafeRedirect(): string {
  // First check sessionStorage (set before OAuth redirect)
  const fromSession = sessionStorage.getItem("rzfood_oauth_redirect");
  if (fromSession) {
    sessionStorage.removeItem("rzfood_oauth_redirect");
    return safeInternalRedirect(fromSession);
  }
  // Fallback to URL params
  const search = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash?.replace(/^#/, "") || "");
  const direct = search.get("redirect");
  const fromState = decodeStateRedirect(search.get("state") || hash.get("state"));
  const raw = direct || fromState || "/home";
  return safeInternalRedirect(raw);
}

const AuthCallback = () => {
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    let cancelled = false;

    const redirect = getSafeRedirect();
    const isCartFlow = redirect.startsWith("/cart");

    dbg("callback", "AuthCallback mounted", {
      redirect,
      isCartFlow,
      hashLength: (window.location.hash || "").length,
      hasCode: new URLSearchParams(window.location.search).has("code"),
      hasAccessToken: (window.location.hash || "").includes("access_token="),
    }, "info");

    const doRedirect = async (session: Session | null, source: string) => {
      if (handled.current || cancelled) return;
      handled.current = true;

      if (!session?.access_token) {
        dbg("callback", "No access token — redirecting to fallback", undefined, "fail");
        window.location.href = redirect;
        return;
      }

      dbg("callback", `Session resolved via ${source}`, {
        authenticated: !!session?.user?.id,
      }, "success");

      setProfileSeed(session);
      ensureClientProfile(session).catch(() => {});

      let finalRedirect = redirect;

      if (isCartFlow && session?.user?.id && session?.access_token) {
        try {
          const rows = await directSelect<{ display_name: string | null; phone: string | null }>(
            "profiles",
            `user_id=eq.${session.user.id}&select=display_name,phone&limit=1`,
            session.access_token
          );
          const profile = rows[0] ?? null;
          finalRedirect = profile?.display_name?.trim() && profile?.phone?.trim()
            ? "/cart?step=payment"
            : "/cart?step=profile";
        } catch {
          finalRedirect = "/cart?step=profile";
        }
      }

      window.history.replaceState(null, "", "/auth/callback");
      dbg("callback", `Final redirect → ${finalRedirect}`, undefined, "success");
      window.location.href = finalRedirect;
    };

    const resolve = async () => {
      // 1. PKCE code exchange (Lovable Cloud / standard OAuth)
      const url = new URL(window.location.href);
      const code = url.searchParams.get("code");

      if (code) {
        dbg("callback", "PKCE code detected — exchanging for session", undefined, "info");
        try {
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            dbg("callback", "exchangeCodeForSession failed", { error: error.message }, "fail");
          } else if (data.session) {
            dbg("callback", "exchangeCodeForSession succeeded", {
              authenticated: !!data.session.user?.id,
            }, "success");
            void doRedirect(data.session, "exchangeCodeForSession");
            return;
          }
        } catch (err) {
          dbg("callback", "exchangeCodeForSession threw", { error: String(err) }, "fail");
        }
      }

      // 2. Hash tokens (implicit flow fallback)
      const hash = window.location.hash?.startsWith("#") ? window.location.hash.slice(1) : "";
      if (hash) {
        const params = new URLSearchParams(hash);
        const accessToken = params.get("access_token");
        const refreshToken = params.get("refresh_token");

        if (accessToken && refreshToken) {
          dbg("callback", "Hash tokens detected — calling setSession", undefined, "info");
          try {
            const { data, error } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
            if (!error && data.session) {
              dbg("callback", "setSession succeeded", {
                authenticated: !!data.session.user?.id,
              }, "success");
              void doRedirect(data.session, "setSession");
              return;
            }
          } catch (err) {
            dbg("callback", "setSession threw", { error: String(err) }, "fail");
          }
        }
      }

      // 3. Check if SDK already has a session (e.g. auto-detected by SDK)
      try {
        const { data } = await supabase.auth.getSession();
        if (data.session && isValidSession(data.session)) {
          dbg("callback", "SDK already has session", {
            authenticated: !!data.session.user?.id,
          }, "success");
          void doRedirect(data.session, "getSession");
          return;
        }
      } catch (error) {
        dbg("callback", "Could not read existing auth session", {
          error: error instanceof Error ? error.message : "unknown error",
        }, "info");
      }

      // 4. Listen for auth state change as last resort
      dbg("callback", "No immediate session — waiting for onAuthStateChange", undefined, "info");
    };

    void resolve();

    // Listener for delayed session resolution
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      dbg("callback", `onAuthStateChange: ${_event}`, {
        authenticated: !!session?.user?.id,
      }, "info");
      if (_event === "SIGNED_OUT") return;
      if (isValidSession(session)) void doRedirect(session, "onAuthStateChange");
    });

    // Safety timeout
    const timeout = setTimeout(() => {
      if (handled.current) return;
      dbg("callback", "Safety timeout (5s) — redirecting", { redirect }, "fail");
      handled.current = true;
      window.location.href = redirect;
    }, 5000);

    return () => {
      cancelled = true;
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Connexion en cours…</p>
      </div>
    </div>
  );
};

export default AuthCallback;
