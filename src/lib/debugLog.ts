/**
 * Auth Monitoring & Debug Log System
 *
 * Structured, buffered logging for the entire auth lifecycle.
 * Enable:  localStorage.setItem("rzfood_debug", "1")
 * Disable: localStorage.removeItem("rzfood_debug")
 */

const STORAGE_KEY = "rzfood_debug";
const MAX_LOG_ENTRIES = 500;

// ── Tag colors ──
const COLORS: Record<string, string> = {
  auth:       "color:#6366f1;font-weight:bold",
  session:    "color:#14b8a6;font-weight:bold",
  supabase:   "color:#3b82f6;font-weight:bold",
  oauth:      "color:#ec4899;font-weight:bold",
  callback:   "color:#8b5cf6;font-weight:bold",
  error:      "color:#ef4444;font-weight:bold",
  extension:  "color:#f97316;font-weight:bold",
  cart:       "color:#f59e0b;font-weight:bold",
  checkout:   "color:#10b981;font-weight:bold",
  restaurant: "color:#06b6d4;font-weight:bold",
  redirect:   "color:#f97316;font-weight:bold",
  profile:    "color:#a855f7;font-weight:bold",
};

// ── Log entry type ──
export interface AuthLogEntry {
  id: number;
  timestamp: string;
  tag: string;
  message: string;
  result?: "success" | "fail" | "info";
  data?: unknown;
}

// ── In-memory circular buffer ──
let logIdCounter = 0;
const logBuffer: AuthLogEntry[] = [];
const listeners = new Set<() => void>();

function pushLog(entry: AuthLogEntry) {
  logBuffer.push(entry);
  if (logBuffer.length > MAX_LOG_ENTRIES) {
    logBuffer.splice(0, logBuffer.length - MAX_LOG_ENTRIES);
  }
  listeners.forEach((fn) => {
    try { fn(); } catch { /* noop */ }
  });
}

/** Subscribe to log updates. Returns unsubscribe function. */
export function onLogUpdate(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Get a snapshot of all buffered logs. */
export function getLogBuffer(): readonly AuthLogEntry[] {
  return logBuffer;
}

/** Clear the log buffer. */
export function clearLogBuffer(): void {
  logBuffer.length = 0;
  logIdCounter = 0;
  listeners.forEach((fn) => { try { fn(); } catch { /* noop */ } });
}

/** Copy all logs as formatted text. */
export function exportLogsAsText(): string {
  return logBuffer
    .map((e) => {
      const dataStr = e.data !== undefined ? ` | ${JSON.stringify(e.data)}` : "";
      const resultStr = e.result ? ` [${e.result.toUpperCase()}]` : "";
      return `${e.timestamp} [${e.tag.toUpperCase()}]${resultStr} ${e.message}${dataStr}`;
    })
    .join("\n");
}

// ── Core API ──

export function isDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try { return localStorage.getItem(STORAGE_KEY) === "1"; } catch { return false; }
}

export function setDebugEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (enabled) localStorage.setItem(STORAGE_KEY, "1");
    else localStorage.removeItem(STORAGE_KEY);
  } catch { /* storage may be blocked */ }
  if (!enabled) logBuffer.length = 0;
  listeners.forEach((fn) => { try { fn(); } catch { /* noop */ } });
}

const SENSITIVE_KEY = /(?:email|token|password|phone|address|location|latitude|longitude|user.?id|\buid\b|session|\burl\b|intent|order.?id|table.?token|authorization|credential)/i;
const EMAIL_VALUE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const JWT_VALUE = /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g;

function sanitizeLogValue(value: unknown, key = "", depth = 0): unknown {
  if (SENSITIVE_KEY.test(key)) return "[redacted]";
  if (typeof value === "string") {
    return value
      .replace(EMAIL_VALUE, "[email]")
      .replace(JWT_VALUE, "[token]")
      .replace(/\bBearer\s+\S+/gi, "Bearer [token]")
      .replace(/([?&](?:access_token|refresh_token|token|table_token|code|key)=)[^&\s]*/gi, "$1[redacted]")
      .slice(0, 2000);
  }
  if (depth >= 5) return "[truncated]";
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => sanitizeLogValue(item, "", depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).slice(0, 50).map(([childKey, child]) => [childKey, sanitizeLogValue(child, childKey, depth + 1)]));
  }
  return value;
}

function now(): string {
  return new Date().toISOString().slice(11, 23);
}

/**
 * Primary structured log function.
 * Always buffers; only prints to console when debug is enabled.
 */
export function dbg(tag: string, message: string, data?: unknown, result?: "success" | "fail" | "info"): void {
  if (!isDebugEnabled()) return;
  const entry: AuthLogEntry = {
    id: ++logIdCounter,
    timestamp: now(),
    tag,
    message: sanitizeLogValue(message) as string,
    result,
    data: data !== undefined ? sanitizeLogValue(data) : undefined,
  };
  pushLog(entry);

  const color = COLORS[tag] || "color:#888;font-weight:bold";
  const resultBadge = result ? (result === "success" ? " ✅" : result === "fail" ? " ❌" : " ℹ️") : "";

  if (data !== undefined) {
    console.log(`%c[${tag.toUpperCase()}]%c ${entry.timestamp}${resultBadge} ${entry.message}`, color, "color:inherit", entry.data);
  } else {
    console.log(`%c[${tag.toUpperCase()}]%c ${entry.timestamp}${resultBadge} ${entry.message}`, color, "color:inherit");
  }
}

/** Shortcut: log an error with tag + stack trace. */
export function dbgError(tag: string, message: string, error: unknown): void {
  const errObj = error instanceof Error ? error : new Error(String(error));
  dbg("error", `[${tag.toUpperCase()}] ${message}`, {
    message: errObj.message,
    stack: errObj.stack?.split("\n").slice(0, 4).join("\n"),
  }, "fail");
}

/**
 * Log current auth storage state — useful for debugging redirect issues.
 */
export function dbgAuthState(tag: string, label: string): void {
  const state = {
    rzfood_checkout_intent: sessionStorage.getItem("rzfood_checkout_intent"),
    rzfood_cart_resume: sessionStorage.getItem("rzfood_cart_resume"),
    rzfood_prev_page: sessionStorage.getItem("rzfood_prev_page"),
    has_sb_token: (() => {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith("sb-") && k.endsWith("-auth-token")) return true;
      }
      return false;
    })(),
  };
  dbg(tag, `📋 ${label}`, state, "info");
}

/** Detect common browser extension injections. */
export function detectExtensions(): Record<string, boolean> {
  const w = window as Window & {
    tronLink?: unknown;
    tronWeb?: unknown;
    ton?: unknown;
    tonkeeper?: unknown;
    ethereum?: { isMetaMask?: boolean };
    solana?: { isPhantom?: boolean };
  };
  return {
    tronLink: !!w.tronLink || !!w.tronWeb,
    tonkeeper: !!w.ton || !!w.tonkeeper,
    metamask: !!w.ethereum?.isMetaMask,
    phantom: !!w.solana?.isPhantom,
  };
}
