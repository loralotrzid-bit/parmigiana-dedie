import { createClient } from "https://esm.sh/@supabase/supabase-js@2.96.0";
import { priceOptions } from "../_shared/orderPricing.ts";
import { menuBasePrice, isWeekend } from "../_shared/menuPricing.ts";
import { hashToken, resolveMenuSession } from "../_shared/menuSession.ts";
import { consumeRequestRateLimit, consumeRequestRateLimitPair, getTrustedClientIp } from "../_shared/requestRateLimit.ts";

const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization,apikey,content-type,x-client-info,x-supabase-client-platform,x-supabase-client-platform-version,x-supabase-client-runtime,x-supabase-client-runtime-version", "Content-Type": "application/json", "Cache-Control": "no-store" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers });
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const raw = await req.text();
    if (raw.length > 50000) return json({ error: "Sélection trop volumineuse" }, 413);
    const body = JSON.parse(raw);
    if (!body || typeof body !== "object") return json({ error: "Requête invalide" }, 400);
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const clientIp = getTrustedClientIp(req);
    if (["table_info", "table_status", "table_request", "table_options", "table_request_number", "table_status_number"].includes(body.action)) {
      const tokenAction = ["table_info", "table_status", "table_request"].includes(body.action);
      const numberAction = ["table_request_number", "table_status_number"].includes(body.action);
      const statusAction = ["table_status", "table_status_number"].includes(body.action);
      if (numberAction && (!Number.isInteger(body.table_number) || body.table_number < 1 || body.table_number > 10)) return json({ error: "Numéro de table invalide" }, 400);
      const token = body.table_token;
      if (tokenAction && (typeof token !== "string" || !/^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(token))) {
        return json({ error: "QR de table invalide" }, 400);
      }
      if (!clientIp) return json({ error: "Service temporairement indisponible" }, 503);
      const quotaScope = statusAction ? "digital-menu-status" : "digital-menu-prepare";
      try {
        const ipQuota = body.action === "table_request" || body.action === "table_request_number" ? 300 : 6000;
        const actorIdentity = numberAction
          ? `table-number:${body.table_number}`
          : tokenAction
            ? `table-token:${token}`
            : `menu-options:${body.slug || "la-parmigiana"}`;
        const actorQuota = statusAction ? 600 : body.action === "table_request" || body.action === "table_request_number" ? 30 : 1200;
        const allowed = body.action === "table_options"
          ? await consumeRequestRateLimit(db, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, quotaScope, `ip:${clientIp}`, 1200, 60)
          : await consumeRequestRateLimitPair(db, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, quotaScope, actorIdentity, actorQuota, `ip:${clientIp}`, ipQuota, 60);
        if (!allowed) {
          return json({ error: "Trop de requêtes. Réessayez dans un instant." }, 429);
        }
      } catch {
        return json({ error: "Service temporairement indisponible" }, 503);
      }
      if (body.action === "table_options") {
        const { data: restaurant, error: restaurantError } = await db.from("restaurants").select("id,dine_in_enabled,digital_menu_enabled,is_paused").eq("slug", "la-parmigiana").maybeSingle();
        if (restaurantError || !restaurant || !restaurant.digital_menu_enabled || restaurant.is_paused) return json({ error: "Menu indisponible" }, 404);
        if (!restaurant.dine_in_enabled) return json({ dine_in_enabled: false, tables: [] });
        const { data: tables, error } = await db.from("restaurant_tables").select("table_number").eq("restaurant_id", restaurant.id).eq("is_active", true).order("table_number");
        if (error) throw error;
        return json({ dine_in_enabled: true, tables: (tables || []).map((table) => table.table_number) });
      }
      if (numberAction) {
        const { data: restaurant } = await db.from("restaurants").select("id,dine_in_enabled,digital_menu_enabled,is_paused").eq("slug", "la-parmigiana").maybeSingle();
        if (!restaurant?.digital_menu_enabled || restaurant.is_paused || !restaurant.dine_in_enabled) return json({ error: "Le service sur place est indisponible." }, 400);
        const { data: table } = await db.from("restaurant_tables").select("qr_token").eq("restaurant_id", restaurant.id).eq("table_number", body.table_number).eq("is_active", true).maybeSingle();
        if (!table) return json({ error: "Cette table n’est pas disponible." }, 404);
        const rpc = body.action === "table_request_number" ? "request_table_service" : "get_table_service_status";
        const { data, error } = await db.rpc(rpc, { p_token: table.qr_token });
        if (error) throw error;
        return json(body.action === "table_request_number" ? { status: data } : { status: data?.[0]?.status ?? null });
      }
      if (body.action === "table_info") {
        const { data, error } = await db.rpc("get_service_table", { p_token: token });
        if (error) throw error;
        if (!data?.[0]) return json({ error: "Cette table est inactive ou son QR a changé." }, 404);
        return json({ table: data[0] });
      }
      if (body.action === "table_status") {
        const { data, error } = await db.rpc("get_table_service_status", { p_token: token });
        if (error) throw error;
        return json({ status: data?.[0]?.status ?? null });
      }
      const { data, error } = await db.rpc("request_table_service", { p_token: token });
      if (error) throw error;
      return json({ status: data });
    }
    if (body.action === "status") {
      if (!clientIp) return json({ error: "Service temporairement indisponible" }, 503);
      if (typeof body.token !== "string" || body.token.length < 32 || body.token.length > 512) return json({ error: "Session invalide" }, 400);
      try {
        if (!await consumeRequestRateLimitPair(db, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, "digital-menu-status", `order-token:${body.token}`, 120, `ip:${clientIp}`, 6000, 60)) {
          return json({ error: "Trop de vérifications. Réessayez dans un instant." }, 429);
        }
      } catch {
        return json({ error: "Service temporairement indisponible" }, 503);
      }
      const session = await resolveMenuSession(db, body.token);
      if (!session?.order_id || session.order_id !== body.order_id) return json({ error: "Commande inaccessible" }, 403);
      const { data: order, error } = await db.from("orders").select("*,items:order_items(*,choices:order_item_choices(*))").eq("id", session.order_id).single();
      if (error) throw error;
      const { delivery_code, ...safe } = order;
      return json({ order: safe });
    }
    if (body.action !== "prepare" || !["dine_in", "takeaway"].includes(body.order_type) || !Array.isArray(body.items) || !body.items.length || body.items.length > 50 || typeof body.client_session_id !== "string" || !/^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(body.client_session_id)) return json({ error: "Sélection invalide" }, 400);
    if (!clientIp) return json({ error: "Service temporairement indisponible" }, 503);
    try {
      if (!await consumeRequestRateLimitPair(db, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, "digital-menu-prepare", `cart-session:${body.client_session_id}`, 30, `ip:${clientIp}`, 1200, 60)) {
        return json({ error: "Veuillez patienter" }, 429);
      }
    } catch {
      return json({ error: "Service temporairement indisponible" }, 503);
    }
    const { data: restaurant, error: restaurantError } = await db.from("restaurants").select("id,slug,digital_menu_enabled,takeaway_discount,is_paused,dine_in_enabled").eq("slug", body.slug).single();
    if (restaurantError || restaurant?.slug !== "la-parmigiana" || !restaurant?.digital_menu_enabled || restaurant.is_paused || (body.order_type === "dine_in" && !restaurant.dine_in_enabled)) return json({ error: "Commande indisponible" }, 400);
    let tableNumber: number | null = null;
    if (body.table_token != null) {
      if (typeof body.table_token !== "string" || !/^[a-f\d-]{36}$/i.test(body.table_token)) return json({ error: "Table invalide" }, 400);
      const { data: table, error: tableError } = await db.from("restaurant_tables").select("table_number,restaurant_id").eq("qr_token", body.table_token).eq("is_active", true).maybeSingle();
      if (tableError || !table || table.restaurant_id !== restaurant.id) return json({ error: "Table inaccessible" }, 403);
      if (body.order_type === "dine_in") tableNumber = table.table_number;
    }
    if (body.order_type === "dine_in" && !tableNumber && Number.isInteger(body.table_number) && body.table_number >= 1 && body.table_number <= 10) {
      const { data: table } = await db.from("restaurant_tables").select("table_number").eq("restaurant_id", restaurant.id).eq("table_number", body.table_number).eq("is_active", true).maybeSingle();
      if (!table) return json({ error: "Cette table n’est pas disponible." }, 400);
      tableNumber = table.table_number;
    }
    if (body.order_type === "dine_in" && !tableNumber) return json({ error: "Choisissez une table pour commander sur place." }, 400);
    const quoted = [];
    for (const item of body.items) {
      if (!item || typeof item.product_id !== "string" || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 99 || !Array.isArray(item.options) || item.options.length > 40 || item.options.some((option: unknown) => !isRecord(option) || typeof option.name !== "string")) return json({ error: "Article invalide" }, 400);
      const { data: p, error } = await db.from("products").select("*,categories!inner(restaurant_id)").eq("id", item.product_id).single();
      if (error || !p || p.categories.restaurant_id !== restaurant.id || !p.is_published || !p.is_available || (p.weekend_only && !isWeekend())) return json({ error: "Article indisponible" }, 400);
      const { data: groups, error: groupError } = await db.from("product_option_groups").select("*").eq("product_id", p.id).order("sort_order");
      const { data: options, error: optionError } = await db.from("product_options").select("*").eq("product_id", p.id).order("sort_order");
      if (groupError || optionError) throw groupError || optionError;
      // This catalogue uses direct option groups; reject unsupported linked groups rather than misquote.
      if (groups.some((group) => group.linked_category_id)) return json({ error: "Configuration de produit non prise en charge" }, 400);
      const priced = priceOptions(item.options, groups.map((group) => ({ ...group, options: options.filter((option) => option.option_group_id === group.id) })), options.filter((option) => !option.option_group_id), p.menu_label || "Menu", p.menu_supplement);
      quoted.push({ product_id: p.id, product_name: p.name, quantity: item.quantity, options: priced.choices, unit_price: menuBasePrice(Number(p.price), body.order_type, true, Number(restaurant.takeaway_discount)) + priced.supplement });
    }
    const cartSession = crypto.randomUUID();
    const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("");
    // Session is scoped to this restaurant and cart; only its hash is persisted.
    const { data: cart, error: cartError } = await db.from("carts").insert({ session_id: cartSession, restaurant_id: restaurant.id, order_type: body.order_type }).select("id").single();
    if (cartError) throw cartError;
    const { error: itemsError } = await db.from("cart_items").insert(quoted.map((i) => ({ ...i, cart_id: cart.id })));
    if (itemsError) throw itemsError;
    const { error: sessionError } = await db.from("digital_menu_sessions").insert({ restaurant_id: restaurant.id, token_hash: await hashToken(token), cart_session_id: cartSession, table_number: tableNumber });
    if (sessionError) throw sessionError;
    return json({ table_number: tableNumber, token, cart_session_id: cartSession, restaurant_id: restaurant.id, subtotal: quoted.reduce((s, i) => s + i.unit_price * i.quantity, 0) });
  } catch (error) {
    return json({ error: error instanceof Error && !error.message.includes("relation") ? "Impossible de préparer la sélection. Vérifiez les options et réessayez." : "Service temporairement indisponible" }, 400);
  }
});
