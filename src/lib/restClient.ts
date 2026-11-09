/**
 * Centralized REST API helpers for public data fetching.
 * Uses the Supabase REST API directly with the anon/publishable key,
 * bypassing the Supabase JS client to avoid Navigator LockManager timeouts.
 */

import { logger } from "@/lib/logger";

const REST_BASE_URL = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1`;
const REST_API_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

/** Standard headers for anonymous REST access */
export function restHeaders(): HeadersInit {
  return {
    apikey: REST_API_KEY,
    Accept: "application/json",
  };
}

/**
 * Execute a REST GET query against a Supabase table/view.
 */
export async function restQuery<T = unknown>(
  tag: string,
  table: string,
  params: Record<string, string>,
  signal?: AbortSignal,
): Promise<T[]> {
  const url = `${REST_BASE_URL}/${table}?${new URLSearchParams(params)}`;
  const t0 = performance.now();
  const res = await fetch(url, { headers: restHeaders(), signal });

  if (!res.ok) throw new Error(`${tag} REST ${table} HTTP ${res.status}`);

  const data = (await res.json()) as T[];
  logger.debug(`${tag} REST ${table} → ${data.length} rows (${Math.round(performance.now() - t0)}ms)`);
  return data ?? [];
}

/**
 * Create an AbortController with auto-timeout.
 */
export function withTimeout(ms: number): { ac: AbortController; cleanup: () => void } {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms);
  return { ac, cleanup: () => clearTimeout(timer) };
}
