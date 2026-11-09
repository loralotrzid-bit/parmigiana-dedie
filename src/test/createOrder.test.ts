// @vitest-environment node
import { readFileSync } from "node:fs";
import ts from "typescript";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { priceOptions } from "../../supabase/functions/_shared/orderPricing";
import { menuBasePrice, isWeekend } from "../../supabase/functions/_shared/menuPricing";
import { resolveMenuSession } from "../../supabase/functions/_shared/menuSession";
import { consumeRequestRateLimit } from "../../supabase/functions/_shared/requestRateLimit";

const restaurantId = "012aae54-7638-491a-8c69-b3186a10ffaa";
const productId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const payload = () => ({ restaurant_id: restaurantId, guest_session_id: userId, order_type: "takeaway", payment_method: "cash", items: [{ product_id: productId, quantity: 1, unit_price: 0.01, options: [] }] });

function harness(overrides: Record<string, unknown> = {}, roles: string[] = [], profileRestaurant = restaurantId) {
  const writes: { table: string; value: Record<string, unknown> }[] = [];
  const restaurant = { delivery_mode: "disabled", dine_in_enabled: true, accepted_payments: ["cash", "card_counter"], scheduling_mode: "all", ...overrides };
  const db = {
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: userId, is_anonymous: false } }, error: null })) },
    rpc: vi.fn(async (name: string) => ({ data: name === "consume_edge_request_rate_limit" ? true : 1, error: null })),
    from(table: string) {
      let inserted: Record<string, unknown> | undefined;
      const result = () => ({ data: table === "restaurants" ? restaurant
        : table === "products" ? { name: "Pizza", price: 12, category_id: "cat", stock: null, is_available: true, is_published: true, ...overrides.product as object }
        : table === "categories" ? { restaurant_id: restaurantId }
        : table === "user_roles" ? roles.map((role) => ({ role }))
        : table === "profiles" ? { restaurant_id: profileRestaurant }
        : table === "digital_menu_sessions" ? overrides.menuSession || null
        : inserted ? { id: "created", created_at: new Date().toISOString(), ...inserted } : [], error: null });
      const query = {
        select: () => query, eq: () => query, gt: () => query, order: () => query,
        insert: (value: Record<string, unknown>) => { inserted = value; writes.push({ table, value }); return query; },
        single: async () => result(), maybeSingle: async () => result(),
        then: (resolve: (v: unknown) => unknown) => Promise.resolve(result()).then(resolve),
      };
      return query;
    },
  };
  let handler!: (req: Request) => Promise<Response>;
  const source = readFileSync("supabase/functions/create-order/index.ts", "utf8").replace(/^import .*;\r?\n/gm, "");
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  // Execute the real handler with a fake database and no network/timers.
  new Function("createClient", "priceOptions", "menuBasePrice", "isWeekend", "resolveMenuSession", "consumeRequestRateLimit", "Deno", "setInterval", js)(() => db, priceOptions, menuBasePrice, isWeekend, resolveMenuSession, consumeRequestRateLimit, { env: { get: () => "test" }, serve: (fn: typeof handler) => { handler = fn; } }, () => 0);
  return { db, writes, call: (body: unknown, auth = true) => handler(new Request("http://local/create-order", {
    method: "POST", headers: { "content-type": "application/json", ...(auth ? { authorization: "Bearer test" } : {}) }, body: JSON.stringify(body),
  })) };
}

describe("create-order request validation (mocked database)", () => {
  beforeEach(() => vi.restoreAllMocks());
  it("rejects disabled delivery without writes", async () => {
    const h = harness(); expect((await h.call({ ...payload(), order_type: "delivery" })).status).toBe(400); expect(h.writes).toEqual([]);
  });
  it("requires verified authentication", async () => { const h = harness(); expect((await h.call(payload(), false)).status).toBe(401); expect(h.writes).toEqual([]); });
  it("rejects another customer's identity", async () => { const h = harness(); expect((await h.call({ ...payload(), guest_session_id: "other" })).status).toBe(403); });
  it("rejects customer impersonation of POS", async () => { const h = harness(); expect((await h.call({ ...payload(), order_source: "pos" })).status).toBe(403); });
  it("rejects POS access to another restaurant", async () => { const h = harness({}, ["restaurant_admin"], "other"); expect((await h.call({ ...payload(), order_source: "pos" })).status).toBe(403); });
  it("preserves authorized restaurant POS", async () => { const h = harness({}, ["restaurant_admin"]); expect((await h.call({ ...payload(), order_source: "pos" })).status).toBe(201); });
  it("rejects unaccepted payments", async () => { const h = harness(); expect((await h.call({ ...payload(), payment_method: "wero" })).status).toBe(400); });
  it("rejects disabled dine-in", async () => { const h = harness({ dine_in_enabled: false }); expect((await h.call({ ...payload(), order_type: "dine_in" })).status).toBe(400); });
  it("rejects tomorrow for today-only restaurant", async () => { const h = harness({ scheduling_mode: "today_only" }); expect((await h.call({ ...payload(), scheduled_at: new Date(Date.now() + 172800000).toISOString() })).status).toBe(400); });
  it.each([null, [], "invalid"])("rejects malformed payload %j", async (body) => { expect((await harness().call(body)).status).toBe(400); });
  it("rejects null items", async () => { expect((await harness().call({ ...payload(), items: [null] })).status).toBe(400); });
  it("rejects malformed options", async () => { const p = payload(); const item = { ...p.items[0], options: [null] }; expect((await harness().call({ ...p, items: [item] })).status).toBe(400); });
  it("checks stock across multiple lines", async () => { const h = harness({ product: { stock: 1 } }); const p = payload(); expect((await h.call({ ...p, items: [...p.items, ...p.items] })).status).toBe(400); expect(h.writes).toEqual([]); });
  it("rejects unpublished products", async () => { const h = harness({ product: { is_published: false } }); expect((await h.call(payload())).status).toBe(400); expect(h.writes).toEqual([]); });
  it("stores catalogue prices for takeaway", async () => { const h = harness(); expect((await h.call(payload())).status).toBe(201); expect(h.writes.find((w) => w.table === "orders")?.value.total).toBe(12); });
  it("applies the restaurant takeaway discount on the server", async () => { const h = harness({ digital_menu_enabled: true, takeaway_discount: 1 }); expect((await h.call(payload())).status).toBe(201); expect(h.writes.find((w) => w.table === "orders")?.value.total).toBe(11); });
  it("rejects forged QR capability even with a QR source", async () => { const h = harness(); expect((await h.call({ ...payload(), menu_session_token: 'a'.repeat(64), order_source: 'qr' }, false)).status).toBe(403); });
  it("rejects a menu session for another restaurant", async () => { const h = harness({ menuSession: { id: 's', restaurant_id: 'other', cart_session_id: userId } }); expect((await h.call({ ...payload(), menu_session_token: 'a'.repeat(64), order_source: 'qr' }, false)).status).toBe(403); });
  it.each(["dine_in", "takeaway"])("accepts no contact details in a verified Parmigiana %s menu session", async (order_type) => {
    const h = harness({ slug: "la-parmigiana", digital_menu_enabled: true, menuSession: { id: "s", restaurant_id: restaurantId, cart_session_id: userId } });
    const response = await h.call({ ...payload(), order_type, order_source: "qr", menu_session_token: "a".repeat(64), client_phone: null }, false);
    expect(response.status).toBe(201); expect(h.db.auth.getUser).not.toHaveBeenCalled();
    expect(h.db.rpc).toHaveBeenCalledWith("submit_digital_menu_order", expect.objectContaining({ p_order: expect.objectContaining({ client_phone: null }) }));
  });
  it("does not extend the exception to another enabled restaurant", async () => {
    const h = harness({ slug: "other", digital_menu_enabled: true, menuSession: { id: "s", restaurant_id: restaurantId, cart_session_id: userId } });
    expect((await h.call({ ...payload(), order_source: "qr", menu_session_token: "a".repeat(64) }, false)).status).toBe(403);
  });
});


describe("phone orders and table binding", () => {
  const phonePayload = () => ({ ...payload(), order_source: "phone", request_id: "33333333-3333-4333-8333-333333333333", client_phone: "+32470000000" });
  it("refuses a customer posing as a phone operator without writes", async () => {
    const h = harness(); expect((await h.call(phonePayload())).status).toBe(403); expect(h.writes).toEqual([]);
  });
  it("refuses another restaurant's phone operator", async () => {
    const h = harness({}, ["restaurant_admin"], "other"); expect((await h.call(phonePayload())).status).toBe(403);
  });
  it("requires a valid phone number", async () => {
    const h = harness({}, ["restaurant_admin"]); expect((await h.call({ ...phonePayload(), client_phone: "bad" })).status).toBe(400);
  });
  it("requires a durable request id", async () => {
    const h = harness({}, ["restaurant_admin"]); expect((await h.call({ ...phonePayload(), request_id: null })).status).toBe(400);
  });
  it("uses the atomic phone RPC with server prices", async () => {
    const h = harness({}, ["restaurant_admin"]); expect((await h.call(phonePayload())).status).toBe(201);
    expect(h.db.rpc).toHaveBeenCalledWith("submit_phone_order", expect.objectContaining({ p_request_id: phonePayload().request_id, p_user_id: userId, p_order: expect.objectContaining({ total: 12, client_phone: "+32470000000" }) }));
    expect(h.writes).toEqual([]);
  });
  it("allows staff phone delivery when public delivery is disabled and applies the fallback fee", async () => {
    const h = harness({ phone_delivery_fallback_fee: 15 }, ["restaurant_admin"]);
    expect((await h.call({ ...phonePayload(), order_type: "delivery", delivery_postcode: "6999", delivery_address: "1 rue de test" })).status).toBe(201);
    expect(h.db.rpc).toHaveBeenCalledWith("submit_phone_order", expect.objectContaining({ p_order: expect.objectContaining({ total: 27, delivery_fee: 15, delivery_postcode: "6999" }) }));
  });
  it("binds the dine-in order to the server session table, ignoring a forged table", async () => {
    const h = harness({ slug: "la-parmigiana", digital_menu_enabled: true, menuSession: { id: "s", restaurant_id: restaurantId, cart_session_id: userId, table_number: 3 } });
    expect((await h.call({ ...payload(), order_type: "dine_in", order_source: "qr", menu_session_token: "a".repeat(64), table_number: 9 }, false)).status).toBe(201);
    expect(h.db.rpc).toHaveBeenCalledWith("submit_digital_menu_order", expect.objectContaining({ p_order: expect.objectContaining({ table_number: 3 }) }));
  });
  it("clears the table when ordering takeaway", async () => {
    const h = harness({ slug: "la-parmigiana", digital_menu_enabled: true, menuSession: { id: "s", restaurant_id: restaurantId, cart_session_id: userId, table_number: 3 } });
    expect((await h.call({ ...payload(), order_source: "qr", menu_session_token: "a".repeat(64) }, false)).status).toBe(201);
    expect(h.db.rpc).toHaveBeenCalledWith("submit_digital_menu_order", expect.objectContaining({ p_order: expect.objectContaining({ table_number: null }) }));
  });
});
