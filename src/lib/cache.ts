/**
 * Lightweight in-memory TTL cache with request deduplication.
 * No dependencies. Works in browser and edge functions.
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const store = new Map<string, CacheEntry<unknown>>();
// In-flight promises — prevents duplicate parallel requests for the same key
const inflight = new Map<string, Promise<unknown>>();

// Periodic cleanup every 60s to avoid memory leaks
let cleanupTimer: ReturnType<typeof setInterval> | null = null;
function scheduleCleanup() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (entry.expiresAt <= now) store.delete(key);
    }
  }, 60_000);
}

/**
 * Get a cached value, or compute & store it.
 * Deduplicates: if the same key is requested while a fetch is in-flight,
 * the second caller shares the first caller's promise.
 */
export async function cached<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>
): Promise<T> {
  scheduleCleanup();

  const now = Date.now();
  const entry = store.get(key) as CacheEntry<T> | undefined;

  // 1. Cache hit — still valid
  if (entry && entry.expiresAt > now) {
    return entry.value;
  }

  // 2. Stale-while-revalidate — expired but present → return stale, refresh background
  if (entry) {
    if (!inflight.has(key)) {
      const bgPromise = fn().then((value) => {
        store.set(key, { value, expiresAt: Date.now() + ttlMs });
        inflight.delete(key);
        return value;
      }).catch((err) => {
        inflight.delete(key);
        throw err;
      });
      inflight.set(key, bgPromise);
    }
    return entry.value;
  }

  // 3. No cache at all — deduplicate in-flight requests
  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;

  const promise = fn().then((value) => {
    store.set(key, { value, expiresAt: Date.now() + ttlMs });
    inflight.delete(key);
    return value;
  }).catch((err) => {
    inflight.delete(key);
    throw err;
  });

  inflight.set(key, promise);
  return promise;
}

/**
 * Invalidate a specific key or all keys matching a prefix.
 */
export function invalidateCache(keyOrPrefix: string) {
  if (store.has(keyOrPrefix)) {
    store.delete(keyOrPrefix);
    return;
  }
  // Prefix match
  for (const key of store.keys()) {
    if (key.startsWith(keyOrPrefix)) store.delete(key);
  }
}

/**
 * Clear the entire in-memory cache. Call on sign-out to avoid stale data
 * surviving across different user sessions.
 */
export function clearAllCache() {
  store.clear();
  inflight.clear();
}

// TTL constants (ms)
export const TTL = {
  GEO_SEARCH: 30 * 24 * 60 * 60 * 1000,   // 30 days
  GEO_REVERSE: 30 * 24 * 60 * 60 * 1000,   // 30 days
  RESTAURANTS: 90 * 1000,                    // 90 seconds
  RESTAURANT_CONFIG: 10 * 60 * 1000,         // 10 minutes
  MENU: 10 * 60 * 1000,                      // 10 minutes
  PRODUCT_OPTIONS: 10 * 60 * 1000,           // 10 minutes
  DELIVERY_DISTANCE: 15 * 60 * 1000,         // 15 minutes
} as const;
