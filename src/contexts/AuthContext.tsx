import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import { clearAllCache } from "@/lib/cache";
import { persistClearAll } from "@/lib/persistCache";
import { clearProfileSeed } from "@/lib/profileSeed";
import { dbg, dbgError } from "@/lib/debugLog";
import { safeSupabaseCall } from "@/lib/safeSupabaseCall";
import { clearCartSessionId } from "@/services/cartService";
import { isActiveAuthTab } from "@/lib/tabElection";
import { AuthContext } from "@/contexts/authContextStore";

function clearCheckoutStorage() {
  if (typeof window === "undefined") return;
  try {
    clearCartSessionId();
    localStorage.removeItem("rzfood_last_order_id");
    const sessionKeys = [
      "rzfood_checkout_intent",
      "rzfood_cart_resume",
      "rzfood_prev_page",
      "rzfood_order_source",
      "rzfood_table_number",
      "rzfood_qr_seen",
    ];
    sessionKeys.forEach((key) => sessionStorage.removeItem(key));
  } catch { /* ignore */ }
}

interface RoleData { isAdmin: boolean; isSuperAdmin: boolean; restaurantId: string | null; fetchedAt: number; }
const rolesCache = new Map<string, RoleData>();
const rolesFetchInFlight = new Map<string, Promise<RoleData | null>>();
const ROLES_CACHE_TTL = 60_000;
const AUTH_EVENT_DEBOUNCE_MS = 1000;

function isAnon(user: User | null): boolean {
  return !user || user.is_anonymous === true;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const rolesUserIdRef = useRef<string | null>(null);
  const lastProcessedTokenRef = useRef<string | null>(null);
  const lastEventTimeRef = useRef<number>(0);

  const fetchAndApplyRoles = useCallback(async (uid: string) => {
    const cached = rolesCache.get(uid);
    if (cached && Date.now() - cached.fetchedAt < ROLES_CACHE_TTL) {
      rolesUserIdRef.current = uid;
      setIsAdmin(cached.isAdmin);
      setIsSuperAdmin(cached.isSuperAdmin);
      setRestaurantId(cached.restaurantId);
      return;
    }

    const existingFetch = rolesFetchInFlight.get(uid);
    if (existingFetch) {
      const result = await existingFetch;
      if (result) {
        rolesUserIdRef.current = uid;
        setIsAdmin(result.isAdmin);
        setIsSuperAdmin(result.isSuperAdmin);
        setRestaurantId(result.restaurantId);
      }
      return;
    }

    const fetchPromise = (async (): Promise<RoleData | null> => {
      try {
        // Single parallel fetch for roles + profile
        const [rolesData, profileData] = await Promise.all([
          safeSupabaseCall(
            "authContext/roles",
            () => supabase.from("user_roles").select("role").eq("user_id", uid).eq("is_active", true),
            { allowPassive: true }
          ),
          safeSupabaseCall(
            "authContext/profile",
            () => supabase.from("profiles").select("restaurant_id").eq("user_id", uid).maybeSingle(),
            { allowPassive: true }
          ),
        ]);

        if (rolesData === null && profileData === null) return null;

        const roles = (rolesData || []).map((roleRow) => roleRow.role);
        const admin = roles.includes("restaurant_admin") || roles.includes("super_admin");
        const superAdmin = roles.includes("super_admin");
        let rid = profileData?.restaurant_id || null;

        if (superAdmin) {
          const storedImpersonation = sessionStorage.getItem("impersonate_restaurant_id");
          if (storedImpersonation) rid = storedImpersonation;
        }

        const result: RoleData = { isAdmin: admin, isSuperAdmin: superAdmin, restaurantId: rid, fetchedAt: Date.now() };
        rolesCache.set(uid, result);
        dbg("auth", "Roles fetched", { uid: uid.slice(0, 8), roles, admin, superAdmin, restaurantId: rid }, "success");
        return result;
      } catch (err) {
        dbgError("auth", "Roles fetch failed", err);
        return null;
      }
    })();

    rolesFetchInFlight.set(uid, fetchPromise);
    try {
      const result = await fetchPromise;
      if (result) {
        rolesUserIdRef.current = uid;
        setIsAdmin(result.isAdmin);
        setIsSuperAdmin(result.isSuperAdmin);
        setRestaurantId(result.restaurantId);
      }
    } finally {
      rolesFetchInFlight.delete(uid);
    }
  }, []);

  const handleUser = useCallback(async (s: Session | null) => {
    // ── Deduplicate: skip if same access_token already processed ──
    const token = s?.access_token ?? null;
    if (token && token === lastProcessedTokenRef.current) {
      dbg("auth", "handleUser skipped (same token)", undefined, "info");
      return;
    }
    lastProcessedTokenRef.current = token;

    setSession(s);
    setUser(s?.user ?? null);

    dbg("auth", "handleUser", {
      isAnon: s?.user ? isAnon(s.user) : true,
      hasAccessToken: !!token,
    }, s?.user && !isAnon(s.user) ? "success" : "info");

    if (!s?.user || isAnon(s.user)) {
      setIsAdmin(false);
      setIsSuperAdmin(false);
      setRestaurantId(null);
      rolesUserIdRef.current = null;
      return;
    }

    const uid = s.user.id;
    const isUserSwitch = rolesUserIdRef.current !== null && rolesUserIdRef.current !== uid;

    if (isUserSwitch) {
      setIsAdmin(false);
      setIsSuperAdmin(false);
      setRestaurantId(null);
    }

    await fetchAndApplyRoles(uid);
  }, [fetchAndApplyRoles]);

  useEffect(() => {
    let isMounted = true;

    dbg("auth", "AuthProvider boot — listening to onAuthStateChange only");

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      if (!isMounted) return;

      // ── Debounce: skip duplicate events within 1000ms with same token ──
      const now = Date.now();
      const token = s?.access_token ?? "";
      const elapsed = now - lastEventTimeRef.current;

      if (
        event !== "INITIAL_SESSION" &&
        event !== "SIGNED_OUT" &&
        elapsed < AUTH_EVENT_DEBOUNCE_MS &&
        token === lastProcessedTokenRef.current
      ) {
        dbg("auth", `onAuthStateChange DEBOUNCED: ${event}`, { elapsed }, "info");
        return;
      }
      lastEventTimeRef.current = now;

      dbg("auth", `onAuthStateChange: ${event}`, {
        authenticated: !!s?.user?.id,
        hasSession: !!s,
      }, event === "SIGNED_OUT" ? "info" : "success");

      // ── SIGNED_OUT ──
      if (event === "SIGNED_OUT" || !s) {
        setUser(null);
        setSession(null);
        setIsAdmin(false);
        setIsSuperAdmin(false);
        setRestaurantId(null);
        rolesUserIdRef.current = null;
        lastProcessedTokenRef.current = null;
        setIsLoading(false);
        return;
      }

      // ── TOKEN_REFRESHED: silent session update, no roles re-fetch ──
      if (event === "TOKEN_REFRESHED") {
        const uid = s.user?.id;
        if (uid && uid === rolesUserIdRef.current) {
          dbg("auth", "TOKEN_REFRESHED — silent session update (same user)", { uid: uid.slice(0, 8) }, "info");
          setSession(s);
          setUser(s.user);
          lastProcessedTokenRef.current = s.access_token;
          setIsLoading(false);
          return;
        }
      }

      // ── INITIAL_SESSION / SIGNED_IN / USER_UPDATED ──
      void handleUser(s).finally(() => {
        if (isMounted) setIsLoading(false);
      });
    });

    // Safety: if isLoading is still true after 4s, force it to false
    const safetyTimeout = setTimeout(() => {
      if (isMounted) {
        setIsLoading((prev) => {
          if (prev) {
            dbg("auth", "Safety timeout — forcing isLoading=false", undefined, "fail");
          }
          return false;
        });
      }
    }, 4000);

    // ── Session Watcher: proactive token refresh ──
    const sessionWatcherInterval = setInterval(async () => {
      if (!isMounted || !isActiveAuthTab()) return;
      try {
        const { data } = await supabase.auth.getSession();
        const currentSession = data?.session;
        if (!currentSession?.expires_at) return;

        const now = Math.floor(Date.now() / 1000);
        const remaining = currentSession.expires_at - now;

        if (remaining <= 0) {
          dbg("auth", "Session watcher: token EXPIRED — attempting refresh", { remaining }, "fail");
          const { data: refreshData, error } = await supabase.auth.refreshSession();
          if (error || !refreshData?.session) {
            dbg("auth", "Session watcher: refresh failed — forcing logout", { error: error?.message }, "fail");
            const isOnAdmin = window.location.pathname.startsWith("/admin");
            window.location.href = isOnAdmin ? "/admin/login" : "/auth/login";
          }
        } else if (remaining <= 60) {
          dbg("auth", "Session watcher: proactive refresh", { remaining }, "info");
          supabase.auth.refreshSession().catch(() => {});
        }
      } catch { /* ignore */ }
    }, 30_000);

    return () => {
      isMounted = false;
      subscription.unsubscribe();
      clearInterval(sessionWatcherInterval);
      clearTimeout(safetyTimeout);
    };
  }, [handleUser]);

  const signIn = async (email: string, password: string) => {
    if (!email?.trim() || !password) throw new Error("Email et mot de passe requis");
    dbg("auth", "signInWithPassword started");
    rolesCache.clear();
    lastProcessedTokenRef.current = null;
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      dbg("auth", "signInWithPassword failed", { error: error.message }, "fail");
      throw error;
    }
    dbg("auth", "signInWithPassword success", undefined, "success");
  };

  const signOut = async () => {
    dbg("auth", "signOut started");
    rolesCache.clear();
    clearAllCache();
    persistClearAll();
    setUser(null);
    setSession(null);
    setIsAdmin(false);
    setIsSuperAdmin(false);
    setRestaurantId(null);
    sessionStorage.removeItem("impersonate_restaurant_id");
    clearProfileSeed();
    clearCheckoutStorage();
    lastProcessedTokenRef.current = null;

    const signOutPromise = supabase.auth.signOut().catch((err) => {
      dbgError("auth", "signOut error (ignored)", err);
    });
    const timeout = new Promise((resolve) => setTimeout(resolve, 2000));
    await Promise.race([signOutPromise, timeout]);
    dbg("auth", "signOut complete", undefined, "success");
  };

  const impersonateRestaurant = (targetRestaurantId: string) => {
    if (!isSuperAdmin) return;
    dbg("auth", "impersonateRestaurant", { targetRestaurantId }, "info");
    sessionStorage.setItem("impersonate_restaurant_id", targetRestaurantId);
    setRestaurantId(targetRestaurantId);
    setIsAdmin(true);
    if (user) {
      rolesCache.set(user.id, { isAdmin: true, isSuperAdmin: true, restaurantId: targetRestaurantId, fetchedAt: Date.now() });
    }
  };

  return (
    <AuthContext.Provider value={{ user, session, isLoading, isAdmin, isSuperAdmin, restaurantId, signIn, signOut, impersonateRestaurant }}>
      {children}
    </AuthContext.Provider>
  );
}
