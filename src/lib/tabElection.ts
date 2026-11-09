/**
 * Active-tab election system.
 * Only the ACTIVE tab is allowed to call supabase.auth.getSession / refreshSession.
 * Passive tabs read session from localStorage only.
 */
import { dbg } from "@/lib/debugLog";

const ACTIVE_TAB_KEY = "rzfood_active_auth_tab";
const HEARTBEAT_INTERVAL = 4_000; // 4s
const STALE_THRESHOLD = 10_000;   // 10s → tab considered dead

// Unique tab id (per-tab, survives soft navigations)
export const TAB_ID = (() => {
  if (typeof window === "undefined") return "server";
  const existing = sessionStorage.getItem("rzfood_auth_tab_id");
  if (existing) return existing;
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  sessionStorage.setItem("rzfood_auth_tab_id", id);
  return id;
})();

let _isActive = false;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

interface TabRecord {
  tabId: string;
  ts: number;
}

function readOwner(): TabRecord | null {
  try {
    const raw = localStorage.getItem(ACTIVE_TAB_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as TabRecord;
  } catch {
    return null;
  }
}

function writeOwner() {
  try {
    localStorage.setItem(ACTIVE_TAB_KEY, JSON.stringify({ tabId: TAB_ID, ts: Date.now() } satisfies TabRecord));
  } catch { /* quota / private mode */ }
}

function claimActive(reason: string) {
  if (_isActive) return; // already active
  _isActive = true;
  writeOwner();
  dbg("session", `Tab became ACTIVE (${reason})`, { tabId: TAB_ID }, "success");
  startHeartbeat();
}

function becomePassive(reason: string) {
  if (!_isActive) return;
  _isActive = false;
  stopHeartbeat();
  dbg("session", `Tab became PASSIVE (${reason})`, { tabId: TAB_ID }, "info");
}

function startHeartbeat() {
  stopHeartbeat();
  heartbeatTimer = setInterval(() => {
    if (!_isActive) { stopHeartbeat(); return; }
    writeOwner();
  }, HEARTBEAT_INTERVAL);
}

function stopHeartbeat() {
  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
}

/** Run election once at boot. */
export function electActiveTab() {
  if (typeof window === "undefined") { _isActive = true; return; }

  const owner = readOwner();
  const now = Date.now();

  if (!owner) {
    claimActive("no existing owner");
    return;
  }

  if (owner.tabId === TAB_ID) {
    // We were already the owner (page reload)
    _isActive = true;
    writeOwner();
    startHeartbeat();
    dbg("session", "Tab re-claimed ownership (reload)", { tabId: TAB_ID }, "success");
    return;
  }

  if (now - owner.ts > STALE_THRESHOLD) {
    claimActive("previous owner stale");
    return;
  }

  // Another tab is alive → passive
  _isActive = false;
  dbg("session", "Tab starts in PASSIVE mode", { tabId: TAB_ID, activeTabId: owner.tabId, age: now - owner.ts }, "info");

  // Monitor for takeover opportunity
  startPassiveMonitor();
}

let passiveMonitorTimer: ReturnType<typeof setInterval> | null = null;

function startPassiveMonitor() {
  if (passiveMonitorTimer) return;
  passiveMonitorTimer = setInterval(() => {
    if (_isActive) { clearInterval(passiveMonitorTimer!); passiveMonitorTimer = null; return; }
    const owner = readOwner();
    if (!owner || Date.now() - owner.ts > STALE_THRESHOLD) {
      clearInterval(passiveMonitorTimer!);
      passiveMonitorTimer = null;
      claimActive("takeover — previous owner disappeared");
    }
  }, HEARTBEAT_INTERVAL);
}

/** True if this tab is allowed to call supabase.auth SDK methods. */
export function isActiveAuthTab(): boolean {
  return _isActive;
}

/** Force this tab to become ACTIVE (e.g. after OAuth return). */
export function forceClaimActiveTab(reason: string) {
  claimActive(reason);
}

// Cleanup on tab close
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    stopHeartbeat();
    // If we're the owner, remove so next tab can claim immediately
    if (_isActive) {
      try { localStorage.removeItem(ACTIVE_TAB_KEY); } catch { /* */ }
    }
  });

  // Listen for visibility changes — if tab becomes visible and owner is stale, take over
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    const owner = readOwner();
    if (!owner || owner.tabId === TAB_ID) return;
    if (Date.now() - owner.ts > STALE_THRESHOLD) {
      claimActive("takeover on visibility (stale owner)");
    }
  });
}

// Boot election immediately on import
electActiveTab();
