/**
 * Production-grade Supabase SDK interceptor.
 *
 * Architecture:
 * 1. All SDK calls serialized through a promise queue
 * 2. auth.getSession → passes through to real SDK (Supabase = source of truth)
 * 3. auth.signOut → SDK handles everything
 * 4. LockManager errors globally suppressed (SDK internal, harmless)
 * 5. No localStorage hacks — SDK manages its own storage
 */

import { supabase } from "@/integrations/supabase/client";
import { dbg, dbgError } from "@/lib/debugLog";

let queueTail: Promise<void> = Promise.resolve();
let queueId = 0;
let patchInstalled = false;

// ── Helpers ───────────────────────────────────────────────────────────

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return typeof value === "object" && value !== null && typeof (value as { then?: unknown }).then === "function";
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? "unknown error");
}

function isLockError(msg: string): boolean {
  return (msg.includes("LockManager") || msg.includes("timed out")) && msg.includes("lock");
}

// ── Queue ─────────────────────────────────────────────────────────────

// Sources that bypass the serial queue for faster LCP
const LCP_PRIORITY_SOURCES = new Set([
  "authContext/roles",
  "authContext/profile",
]);

export function enqueueSupabaseCall<T>(source: string, fn: () => Promise<T>): Promise<T> {
  const id = ++queueId;

  // LCP-critical calls skip the queue — execute immediately in parallel
  if (LCP_PRIORITY_SOURCES.has(source)) {
    dbg("supabase", `[QUEUE] LCP priority (parallel): ${source}`, { id }, "info");
    return fn().then(
      (result) => { dbg("supabase", `[QUEUE] finish: ${source}`, { id }, "success"); return result; },
      (error) => { dbg("supabase", `[QUEUE] fail: ${source}`, { id, error: getErrorMessage(error) }, "fail"); throw error; }
    );
  }

  dbg("supabase", `[QUEUE] queued: ${source}`, { id }, "info");

  const run = async () => {
    dbg("supabase", `[QUEUE] start: ${source}`, { id }, "info");
    try {
      const result = await fn();
      dbg("supabase", `[QUEUE] finish: ${source}`, { id }, "success");
      return result;
    } catch (error) {
      const msg = getErrorMessage(error);
      if (isLockError(msg)) {
        dbg("supabase", `[QUEUE] lock timeout (suppressed): ${source}`, { id }, "info");
        throw error;
      }
      dbg("supabase", `[QUEUE] fail: ${source}`, { id, error: msg }, "fail");
      throw error;
    }
  };

  const next = queueTail.then(run, run);
  queueTail = next.then(() => undefined, () => undefined);
  return next;
}

// ── Proxy for query builders ──────────────────────────────────────────

const thenableProxyCache = new WeakMap<object, object>();

function wrapThenable<T extends object>(target: T, source: string): T {
  if (thenableProxyCache.has(target)) return thenableProxyCache.get(target) as T;

  const proxy = new Proxy(target, {
    get(originalTarget, prop, receiver) {
      if (prop === "then") {
        return (onFulfilled?: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
          enqueueSupabaseCall(source, () => Promise.resolve(originalTarget as unknown))
            .then(onFulfilled, onRejected);
      }
      const value = Reflect.get(originalTarget, prop, receiver);
      if (typeof value !== "function") return value;
      return (...args: unknown[]) => {
        const result = value.apply(originalTarget, args);
        if (typeof result === "object" && result !== null && isThenable(result)) {
          return wrapThenable(result as object, source);
        }
        return result;
      };
    },
  });

  thenableProxyCache.set(target, proxy);
  return proxy as T;
}

// ── Patches ───────────────────────────────────────────────────────────

function patchSupabaseFrom() {
  const sb = supabase as unknown as { from?: (table: string) => unknown };
  if (!sb.from) return;
  const originalFrom = sb.from.bind(supabase);
  sb.from = (table: string) => {
    const builder = originalFrom(table);
    if (typeof builder === "object" && builder !== null) {
      return wrapThenable(builder as object, `from:${table}`);
    }
    return builder;
  };
}

function patchSupabaseRpc() {
  const sb = supabase as unknown as { rpc?: (fn: string, args?: unknown) => unknown };
  if (!sb.rpc) return;
  const originalRpc = sb.rpc.bind(supabase);
  sb.rpc = (fn: string, args?: unknown) => {
    const builder = originalRpc(fn, args);
    if (typeof builder === "object" && builder !== null && isThenable(builder)) {
      return wrapThenable(builder as object, `rpc:${fn}`);
    }
    return builder;
  };
}

function patchSupabaseInvoke() {
  const functionsApi = (supabase as unknown as { functions?: { invoke?: (name: string, options?: unknown) => Promise<unknown> } }).functions;
  if (!functionsApi?.invoke) return;
  const originalInvoke = functionsApi.invoke.bind(functionsApi);
  functionsApi.invoke = (name: string, options?: unknown) =>
    enqueueSupabaseCall(`fn:${name}`, () => originalInvoke(name, options));
}

// Auth methods are NOT patched — the SDK must manage its own session lifecycle
// without any queue interference. This is critical for OAuth flows where the
// SDK auto-detects URL tokens on initialization.

// ── Install ───────────────────────────────────────────────────────────

export function installSupabaseCallQueue(): void {
  if (patchInstalled) return;
  patchInstalled = true;

  try {
    patchSupabaseFrom();
    patchSupabaseRpc();
    patchSupabaseInvoke();
    dbg("supabase", "Global Supabase queue installed", undefined, "success");
  } catch (error) {
    dbgError("supabase", "Failed to install global Supabase queue", error);
  }
}

if (typeof window !== "undefined") {
  installSupabaseCallQueue();

  // ── Global suppression of SDK-internal LockManager errors ───────
  window.addEventListener("unhandledrejection", (event) => {
    const msg = event.reason?.message || String(event.reason ?? "");
    const isSupabaseLock =
      msg.includes("LockManager") &&
      msg.includes("timed out") &&
      (msg.includes("auth") || msg.includes("lock:sb") || msg.includes("Navigator"));
    if (isSupabaseLock) {
      event.preventDefault();
    }
  });
}
