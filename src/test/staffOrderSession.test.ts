import { beforeEach, expect, it, vi } from "vitest";
import { createOrder } from "@/services/orderService";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentSession } from "@/lib/authSession";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: vi.fn() } } }));
vi.mock("@/lib/authSession", () => ({ getCurrentSession: vi.fn(), isValidSession: () => true }));
vi.mock("@/services/digitalMenuService", () => ({
  readMenuSession: () => ({ restaurant_id: "restaurant", cart_session_id: "guest-cart", token: "guest-capability" }), readMenuReceipt: vi.fn(), fetchMenuOrder: vi.fn(),
}));
vi.mock("@/lib/edgeFunctionFallback", () => ({ invokeEdgeFunctionDirect: vi.fn(), isFunctionsFetchError: () => false, shouldUseEdgeFetchFallback: () => false }));
vi.mock("@/lib/safeSupabaseCall", () => ({ safeSupabaseCall: vi.fn(), safeSupabaseCallOrThrow: vi.fn() }));
vi.mock("@/lib/debugLog", () => ({ dbg: vi.fn() }));
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCurrentSession).mockResolvedValue({ user: { id: "staff", is_anonymous: false } } as Awaited<ReturnType<typeof getCurrentSession>>);
  vi.mocked(supabase.functions.invoke).mockResolvedValue({ data: { order: { id: "order", order_number: 9, total: 10, created_at: "2026-10-31T12:00:00Z" } }, error: null });
});
it.each(["phone", "pos"])("uses staff identity for %s even if an active guest basket exists in the browser", async orderSource => {
  await createOrder("restaurant", [], "takeaway", { orderSource, requestId: "request" });
  expect(supabase.functions.invoke).toHaveBeenCalledWith("create-order", expect.objectContaining({ body: expect.objectContaining({ guest_session_id: "staff", menu_session_token: undefined, order_source: orderSource }) }));
  expect(getCurrentSession).toHaveBeenCalled();
});
it("preserves the guest capability in the QR checkout", async () => {
  await createOrder("restaurant", [], "dine_in", { orderSource: "qr" });
  expect(supabase.functions.invoke).toHaveBeenCalledWith("create-order", expect.objectContaining({ body: expect.objectContaining({ guest_session_id: "guest-cart", menu_session_token: "guest-capability" }) }));
  expect(getCurrentSession).not.toHaveBeenCalled();
});
