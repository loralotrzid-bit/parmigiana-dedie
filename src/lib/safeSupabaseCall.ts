/**
 * Centralized wrapper for all Supabase SDK calls.
 * Prevents LockManager contention by:
 * 1. Guarding calls in passive tabs
 * 2. Logging every call source for debugging
 */
import { isActiveAuthTab } from "@/lib/tabElection";
import { dbg } from "@/lib/debugLog";
import type { PostgrestError } from "@supabase/supabase-js";

type SupabaseResult<T> = { data: T | null; error: PostgrestError | null };
type SupabaseCallable<T> = PromiseLike<SupabaseResult<T>> | Promise<SupabaseResult<T>>;

function isSourceReadOperation(source: string): boolean {
  const normalized = source.toLowerCase();
  return !normalized.includes("/update") && !normalized.includes("/insert") &&
    !normalized.includes("/delete") && !normalized.includes("/upsert") &&
    !normalized.includes("signout") && !normalized.includes("signin");
}

/**
 * Wraps any supabase query (from/rpc) with passive-tab guard + logging.
 * READ operations (select) are ALWAYS allowed, even in passive tabs.
 * WRITE operations are blocked in passive tabs unless allowPassive is set.
 */
export async function safeSupabaseCall<T>(
  source: string,
  call: () => SupabaseCallable<T>,
  opts?: { allowPassive?: boolean }
): Promise<T | null> {
  // Allow all calls in active tab, or if explicitly allowed, or for read operations
  const isActive = isActiveAuthTab();
  const isExplicitlyAllowed = opts?.allowPassive ?? false;

  if (!isActive && !isExplicitlyAllowed) {
    // Still allow reads (SELECT queries) in passive tabs — only block mutations
    if (!isSourceReadOperation(source)) {
      dbg("supabase", `BLOCKED write in passive tab [${source}]`, undefined, "info");
      return null;
    }
    dbg("supabase", `Passive tab READ allowed [${source}]`, undefined, "info");
  }

  dbg("supabase", `SDK call [${source}]`, undefined, "info");

  try {
    const { data, error } = await call();
    if (error) {
      dbg("supabase", `SDK error [${source}]: ${error.message ?? error}`, undefined, "fail");
      return null;
    }
    return data;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    dbg("supabase", `SDK exception [${source}]: ${msg}`, undefined, "fail");
    return null;
  }
}

/**
 * Same but throws on error. Use for critical paths.
 */
export async function safeSupabaseCallOrThrow<T>(
  source: string,
  call: () => SupabaseCallable<T>,
  opts?: { allowPassive?: boolean }
): Promise<T> {
  if (!(opts?.allowPassive ?? false) && !isActiveAuthTab()) {
    if (!isSourceReadOperation(source)) {
      const msg = `Appel bloqué (onglet passif) [${source}]`;
      dbg("supabase", msg, undefined, "fail");
      throw new Error(msg);
    }
    dbg("supabase", `Passive tab READ allowed [${source}]`, undefined, "info");
  }

  dbg("supabase", `SDK call [${source}]`, undefined, "info");

  const { data, error } = await call();
  if (error) {
    dbg("supabase", `SDK error [${source}]: ${error.message ?? error}`, undefined, "fail");
    throw error;
  }
  if (data === null || data === undefined) {
    throw new Error(`No data returned [${source}]`);
  }
  return data;
}
