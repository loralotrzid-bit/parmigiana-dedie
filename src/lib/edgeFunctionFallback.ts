import type { FunctionsFetchError } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const SUPABASE_PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID;

function readTokenFromRawSession(raw: string | null): string | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const source = (parsed.currentSession ?? parsed.session ?? parsed) as Record<string, unknown>;
    const accessToken = source.access_token;
    return typeof accessToken === "string" && accessToken.length > 0 ? accessToken : null;
  } catch {
    return null;
  }
}

export function readAccessTokenFromStorage(): string | null {
  if (typeof window === "undefined") return null;

  const configuredProject = SUPABASE_PROJECT_ID || new URL(SUPABASE_URL).hostname.split(".")[0];
  const preferredKey = `sb-${configuredProject}-auth-token`;
  // Never send a session from the old Supabase project to the new backend.
  return readTokenFromRawSession(localStorage.getItem(preferredKey));
}

export function shouldUseEdgeFetchFallback(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");

  return (
    message.includes("Failed to send a request to the Edge Function") ||
    message.includes("Failed to fetch") ||
    message.includes("NetworkError") ||
    message.includes("Navigator LockManager") ||
    message.includes("auth-token") ||
    message.includes("timed out waiting")
  );
}

export async function invokeEdgeFunctionDirect<T>(
  functionName: string,
  body: Record<string, unknown>,
  signal?: AbortSignal
): Promise<T> {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    apikey: SUPABASE_PUBLISHABLE_KEY,
  };

  const accessToken = readAccessTokenFromStorage();
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const response = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal,
  });

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // non-json response
  }

  if (!response.ok) {
    const message =
      typeof payload === "object" && payload && "error" in payload
        ? String((payload as { error?: unknown }).error ?? "")
        : `Edge Function ${functionName} HTTP ${response.status}`;
    throw new Error(message || `Edge Function ${functionName} failed`);
  }

  return payload as T;
}

export function isFunctionsFetchError(error: unknown): error is FunctionsFetchError {
  return typeof error === "object" && !!error && "name" in error && (error as Error).name === "FunctionsFetchError";
}
