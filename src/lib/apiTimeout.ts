/**
 * Centralised timeout wrapper for all critical API calls.
 * Guarantees no request can hang the UI indefinitely.
 */
const DEFAULT_TIMEOUT_MS = 8000;

export async function withTimeout<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  ms: number = DEFAULT_TIMEOUT_MS
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);

  try {
    return await fn(controller.signal);
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("Request timeout");
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}
