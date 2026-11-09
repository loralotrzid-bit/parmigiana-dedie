/**
 * Auth session resolver — Supabase SDK is the SOLE source of truth.
 *
 * No localStorage reads/writes. No rzfood-auth. No bypass logic.
 * Just the SDK.
 */

import { supabase } from "@/integrations/supabase/client";
import type { Session } from "@supabase/supabase-js";
import { dbg } from "@/lib/debugLog";
import { isActiveAuthTab, TAB_ID } from "@/lib/tabElection";

const TAB_HEARTBEAT_KEY = "rzfood-auth-tabs";
const AUTH_TAB_ID = TAB_ID;

let monitorInitialized = false;

// ── Tab registry ──────────────────────────────────────────────────────

function updateTabsRegistry() {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(TAB_HEARTBEAT_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    const now = Date.now();
    const cleaned = Object.fromEntries(Object.entries(parsed).filter(([, ts]) => now - ts < 90_000));
    cleaned[AUTH_TAB_ID] = now;
    localStorage.setItem(TAB_HEARTBEAT_KEY, JSON.stringify(cleaned));
    const tabCount = Object.keys(cleaned).length;
    dbg("session", "Auth tab registry updated", { tabId: AUTH_TAB_ID, tabCount }, tabCount > 1 ? "fail" : "info");
  } catch { /* ignore */ }
}

function removeTabFromRegistry() {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(TAB_HEARTBEAT_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    delete parsed[AUTH_TAB_ID];
    localStorage.setItem(TAB_HEARTBEAT_KEY, JSON.stringify(parsed));
  } catch { /* ignore */ }
}

// ── Monitor ───────────────────────────────────────────────────────────

function initAuthMonitor() {
  if (monitorInitialized || typeof window === "undefined") return;
  monitorInitialized = true;

  dbg("supabase", "Auth monitor initialized", { tabId: AUTH_TAB_ID }, "info");

  const w = window as Window & { __rzfood_supabase_import_count__?: number };
  w.__rzfood_supabase_import_count__ = (w.__rzfood_supabase_import_count__ ?? 0) + 1;
  dbg("supabase", "Supabase client import count", { count: w.__rzfood_supabase_import_count__ }, w.__rzfood_supabase_import_count__ === 1 ? "success" : "fail");

  updateTabsRegistry();
  window.addEventListener("beforeunload", removeTabFromRegistry);
  window.addEventListener("storage", (event) => {
    if (event.key !== TAB_HEARTBEAT_KEY) return;
    try {
      const parsed = event.newValue ? (JSON.parse(event.newValue) as Record<string, number>) : {};
      const tabCount = Object.keys(parsed).length;
      dbg("session", "Cross-tab auth activity detected", { tabCount, tabId: AUTH_TAB_ID }, tabCount > 1 ? "fail" : "info");
    } catch { /* ignore */ }
  });
}

initAuthMonitor();

// ── Public API ────────────────────────────────────────────────────────

export function clearCurrentSessionCache() {
  // No-op — SDK manages its own state
  dbg("session", "clearCurrentSessionCache called (no-op, SDK is source of truth)", undefined, "info");
}

/**
 * Get the current session from the Supabase SDK.
 * This is the ONLY way to get the session.
 */
export async function getCurrentSession(options: { timeoutMs?: number; allowRefresh?: boolean; allowStorageFallback?: boolean } = {}): Promise<Session | null> {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      dbg("session", "getSession error", { error: error.message }, "fail");
      return null;
    }
    const session = data?.session ?? null;
    dbg("session", "getCurrentSession", {
      valid: isValidSession(session),
    }, session ? "success" : "info");
    return session;
  } catch (err) {
    dbg("session", "getCurrentSession threw", { error: err instanceof Error ? err.message : String(err) }, "fail");
    return null;
  }
}

export async function waitForSession(): Promise<Session | null> {
  return getCurrentSession();
}

export function isValidSession(session: Session | null): session is Session {
  return !!session?.user && !session.user.is_anonymous;
}
