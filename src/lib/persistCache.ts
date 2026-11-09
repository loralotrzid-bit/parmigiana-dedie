/**
 * Ultra-fast localStorage persistence for instant rendering.
 * Stores serialized data with timestamps for staleness checks.
 * Inspired by Uber Eats / Takeaway: show last-known data immediately,
 * then refresh silently in background.
 */

const PREFIX = "rz_cache_";
const MAX_AGE_MS = 30 * 60 * 1000; // 30 min max staleness

interface PersistedEntry<T> {
  data: T;
  ts: number; // timestamp when saved
}

export function persistGet<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const entry: PersistedEntry<T> = JSON.parse(raw);
    // Reject if too old (30 min)
    if (Date.now() - entry.ts > MAX_AGE_MS) {
      localStorage.removeItem(PREFIX + key);
      return null;
    }
    return entry.data;
  } catch {
    return null;
  }
}

export function persistSet<T>(key: string, data: T): void {
  try {
    // Don't persist empty arrays — would show "no results"
    if (Array.isArray(data) && data.length === 0) return;
    const entry: PersistedEntry<T> = { data, ts: Date.now() };
    localStorage.setItem(PREFIX + key, JSON.stringify(entry));
  } catch {
    // Storage full — silently ignore
  }
}

export function persistRemove(key: string): void {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    // ignore
  }
}

/** Remove all rz_cache_* keys from localStorage (call on sign-out). */
export function persistClearAll(): void {
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX)) toRemove.push(k);
    }
    toRemove.forEach((k) => localStorage.removeItem(k));
  } catch {
    // ignore
  }
}
