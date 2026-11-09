import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.96.0";

/** Trust only the IP injected by the Cloudflare edge in front of Supabase.
 * Do not fall back to X-Forwarded-For or X-Real-IP: clients can supply those.
 */
export function getTrustedClientIp(req: Request): string | null {
  const ip = req.headers.get("cf-connecting-ip")?.trim();
  if (!ip || ip.length > 45 || ip.includes(",") || !/^[0-9a-fA-F:.]+$/.test(ip)) return null;
  return ip;
}

/** HMAC pseudonymization prevents raw user IDs, table tokens, or IPs from being stored. */
async function hashIdentity(secret: string, identity: string): Promise<string> {
  if (!secret || !identity || identity.length > 512) throw new Error("Rate limit identity unavailable");
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(identity));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function consumeRequestRateLimit(
  db: SupabaseClient, secret: string, scope: string, identity: string, maxRequests: number, windowSeconds: number,
): Promise<boolean> {
  const keyHash = await hashIdentity(secret, identity);
  const { data, error } = await db.rpc("consume_edge_request_rate_limit", {
    p_scope: scope,
    p_key_hash: keyHash,
    p_max_requests: maxRequests,
    p_window_seconds: windowSeconds,
  });
  if (error || typeof data !== "boolean") throw new Error("Shared rate limiter unavailable");
  return data;
}

export async function consumeRequestRateLimitPair(
  db: SupabaseClient, secret: string, scope: string,
  primaryIdentity: string, primaryMaxRequests: number,
  secondaryIdentity: string, secondaryMaxRequests: number,
  windowSeconds: number,
): Promise<boolean> {
  const [primaryHash, secondaryHash] = await Promise.all([
    hashIdentity(secret, primaryIdentity), hashIdentity(secret, secondaryIdentity),
  ]);
  const { data, error } = await db.rpc("consume_edge_request_rate_limit_pair", {
    p_scope: scope,
    p_primary_key_hash: primaryHash,
    p_primary_max_requests: primaryMaxRequests,
    p_secondary_key_hash: secondaryHash,
    p_secondary_max_requests: secondaryMaxRequests,
    p_window_seconds: windowSeconds,
  });
  if (error || typeof data !== "boolean") throw new Error("Shared rate limiter unavailable");
  return data;
}

