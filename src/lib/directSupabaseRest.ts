/**
 * Direct Supabase REST helpers that bypass the JS SDK (and its LockManager).
 * Use when the SDK is likely blocked (e.g. right after OAuth redirect).
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

function headers(accessToken?: string): HeadersInit {
  const h: HeadersInit = {
    apikey: SUPABASE_KEY,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
  if (accessToken) {
    h.Authorization = `Bearer ${accessToken}`;
  }
  return h;
}

export async function directSelect<T = unknown>(
  table: string,
  query: string,
  accessToken?: string
): Promise<T[]> {
  const url = `${SUPABASE_URL}/rest/v1/${table}?${query}`;
  const res = await fetch(url, {
    method: "GET",
    headers: { ...headers(accessToken), Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`REST select ${table} HTTP ${res.status}`);
  return (await res.json()) as T[];
}

export async function directInsert<T = unknown>(
  table: string,
  payload: Record<string, unknown>,
  accessToken?: string
): Promise<T | null> {
  const url = `${SUPABASE_URL}/rest/v1/${table}`;
  const res = await fetch(url, {
    method: "POST",
    headers: headers(accessToken),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`REST insert ${table} HTTP ${res.status}: ${text}`);
  }
  const data = await res.json().catch(() => null);
  return Array.isArray(data) ? data[0] ?? null : data;
}

export async function directUpdate(
  table: string,
  query: string,
  patch: Record<string, unknown>,
  accessToken?: string
): Promise<void> {
  const url = `${SUPABASE_URL}/rest/v1/${table}?${query}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: headers(accessToken),
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`REST update ${table} HTTP ${res.status}: ${text}`);
  }
}
