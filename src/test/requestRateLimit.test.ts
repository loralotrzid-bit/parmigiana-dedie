import { describe, expect, it, vi } from "vitest";
import { consumeRequestRateLimit, consumeRequestRateLimitPair, getTrustedClientIp } from "../../supabase/functions/_shared/requestRateLimit";

describe("trusted client IP extraction", () => {
  it("uses the Cloudflare supplied client IP", () => {
    const req = new Request("https://example.test", { headers: { "cf-connecting-ip": "203.0.113.8", "x-forwarded-for": "198.51.100.44" } });
    expect(getTrustedClientIp(req)).toBe("203.0.113.8");
  });

  it("ignores caller supplied forwarding headers if the trusted proxy header is absent", () => {
    const req = new Request("https://example.test", { headers: { "x-forwarded-for": "198.51.100.44", "x-real-ip": "198.51.100.45" } });
    expect(getTrustedClientIp(req)).toBeNull();
  });

  it("rejects malformed trusted proxy values", () => {
    const req = new Request("https://example.test", { headers: { "cf-connecting-ip": "203.0.113.8, 198.51.100.2" } });
    expect(getTrustedClientIp(req)).toBeNull();
  });
});

describe("distributed request limiter client", () => {
  it("sends an HMAC pseudonym instead of the raw identity and returns the database decision", async () => {
    const rpc = vi.fn(async (_name: string, _args: Record<string, unknown>) => ({ data: true, error: null }));
    const allowed = await consumeRequestRateLimit({ rpc }, "test-server-secret", "create-order", "user:secret-id", 3, 60);
    const args = rpc.mock.calls[0][1];

    expect(allowed).toBe(true);
    expect(args.p_scope).toBe("create-order");
    expect(args.p_key_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(args.p_key_hash).not.toContain("secret-id");
  });

  it("propagates denials and fails closed when the database counter is unavailable", async () => {
    const denied = await consumeRequestRateLimit({ rpc: vi.fn(async () => ({ data: false, error: null })) }, "secret", "totp-verify", "user-1", 5, 300);
    expect(denied).toBe(false);
    await expect(consumeRequestRateLimit({ rpc: vi.fn(async () => ({ data: null, error: new Error("offline") })) }, "secret", "totp-verify", "user-1", 5, 300)).rejects.toThrow("Shared rate limiter unavailable");
  });

  it("checks identity and IP quotas with one database call", async () => {
    const rpc = vi.fn(async () => ({ data: true, error: null }));
    const allowed = await consumeRequestRateLimitPair({ rpc }, "secret", "cart-api", "user:1", 120, "ip:192.0.2.1", 300, 60);
    expect(allowed).toBe(true);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("consume_edge_request_rate_limit_pair", expect.objectContaining({ p_scope: "cart-api", p_primary_max_requests: 120, p_secondary_max_requests: 300, p_window_seconds: 60 }));
  });
});
