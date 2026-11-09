import { createClient } from "https://esm.sh/@supabase/supabase-js@2.96.0";
import { priceOptions } from "../_shared/orderPricing.ts";
import { menuBasePrice } from "../_shared/menuPricing.ts";
import { consumeRequestRateLimit, consumeRequestRateLimitPair, getTrustedClientIp } from "../_shared/requestRateLimit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, serviceRoleKey);

function tokenHasSubject(token: string): boolean {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return false;
    const payloadBase64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(payloadBase64)) as Record<string, unknown>;
    return typeof payload.sub === "string" && payload.sub.length > 0;
  } catch {
    return false;
  }
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function err(message: string, status = 400) {
  return json({ error: message }, status);
}

// ── Validation helpers ───────────────────────────────────

function isValidUUID(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

interface CartOption { name: string; price?: number; id?: string }
interface CartItemInput {
  restaurant_id: string; product_id: string; product_name: string;
  unit_price: number; quantity: number; options: CartOption[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseAddItem(value: unknown): { item: CartItemInput } | { error: string } {
  if (!isRecord(value)) return { error: "Missing item payload" };
  if (typeof value.restaurant_id !== "string" || !isValidUUID(value.restaurant_id)) return { error: "Invalid restaurant_id" };
  if (typeof value.product_id !== "string" || !isValidUUID(value.product_id)) return { error: "Invalid product_id" };
  if (typeof value.product_name !== "string" || !value.product_name || value.product_name.length > 200) return { error: "Invalid product_name" };
  if (typeof value.unit_price !== "number" || value.unit_price < 0 || value.unit_price > 10000) return { error: "Invalid unit_price" };
  if (typeof value.quantity !== "number" || value.quantity < 1 || value.quantity > 100) return { error: "Invalid quantity" };
  if (value.options !== undefined && (!Array.isArray(value.options) || value.options.length > 40 || !value.options.every((option) => isRecord(option) && typeof option.name === "string" && option.name.length <= 200))) {
    return { error: "Invalid options" };
  }
  return { item: {
    restaurant_id: value.restaurant_id,
    product_id: value.product_id,
    product_name: value.product_name,
    unit_price: value.unit_price,
    quantity: value.quantity,
    options: (value.options ?? []) as CartOption[],
  } };
}

// ── Helpers ──────────────────────────────────────────────

/** Normalize options for deterministic comparison */
function normalizeOptions(options: unknown[]): string {
  if (!options || !Array.isArray(options) || options.length === 0) return "[]";
  const sorted = [...options].sort((left, right) => {
    const key = (value: unknown) => isRecord(value) ? String(value.name || value.id || "") : "";
    return key(left).localeCompare(key(right));
  });
  return JSON.stringify(sorted);
}

/** Find an active cart without creating rows during read-only page loads. */
async function findActiveCart(sessionId: string | null, userId: string | null) {
  // 1. User cart (highest priority)
  if (userId) {
    const { data, error } = await supabase
      .from("carts")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "active")
      .maybeSingle();
    if (error) throw error;
    if (data) return data;
  }

  // 2. Session cart
  if (sessionId) {
    const { data, error } = await supabase
      .from("carts")
      .select("*")
      .eq("session_id", sessionId)
      .eq("status", "active")
      .maybeSingle();
    if (error) throw error;
    if (data) return data;
  }

  return null;
}

/** Race-safe: get or create active cart only for mutating actions. */
async function getOrCreateCart(sessionId: string | null, userId: string | null) {
  const existing = await findActiveCart(sessionId, userId);
  if (existing) return existing;

  // 3. Create — no recursion, single retry on conflict
  const insertData: Record<string, unknown> = {};
  if (userId) insertData.user_id = userId;
  else if (sessionId) insertData.session_id = sessionId;
  else return null;

  const { error } = await supabase.from("carts").insert(insertData);

  // On conflict (unique index), just re-fetch once
  const lookupCol = userId ? "user_id" : "session_id";
  const lookupVal = userId || sessionId;

  const { data: created } = await supabase
    .from("carts")
    .select("*")
    .eq(lookupCol, lookupVal!)
    .eq("status", "active")
    .maybeSingle();

  if (created) return created;
  if (error) throw new Error(`Failed to create cart: ${error.message}`);
  throw new Error("Cart creation failed unexpectedly");
}

/** Get full cart with items in one call */
async function getCart(sessionId: string | null, userId: string | null) {
  const cart = await findActiveCart(sessionId, userId);
  if (!cart) return { cart: null, items: [] };

  const { data: items } = await supabase
    .from("cart_items")
    .select("*")
    .eq("cart_id", cart.id)
    .order("created_at", { ascending: true });

  if (cart.restaurant_id && items?.length) {
    const { data: restaurant } = await supabase.from("restaurants").select("digital_menu_enabled,takeaway_discount").eq("id",cart.restaurant_id).single();
    if (restaurant?.digital_menu_enabled) {
      for (const item of items) {
        const { data: product, error: pe } = await supabase.from("products").select("price,menu_label,menu_supplement").eq("id",item.product_id).single();
        const { data: groups, error: ge } = await supabase.from("product_option_groups").select("*").eq("product_id",item.product_id).order("sort_order");
        const { data: options, error: oe } = await supabase.from("product_options").select("*").eq("product_id",item.product_id).order("sort_order");
        if(pe||ge||oe) throw pe||ge||oe;
        const priced=priceOptions(item.options||[],groups.map((g)=>({...g,options:options.filter((o)=>o.option_group_id===g.id)})),options.filter((o)=>!o.option_group_id),product.menu_label||"Menu",product.menu_supplement);
        item.unit_price=menuBasePrice(Number(product.price),cart.order_type,true,Number(restaurant.takeaway_discount))+priced.supplement;
        item.options=priced.choices;
      }
    }
  }
  return { cart, items: items || [] };
}

// ── Actions ──────────────────────────────────────────────

async function addItem(
  sessionId: string | null,
  userId: string | null,
  item: CartItemInput
) {
  const cart = await getOrCreateCart(sessionId, userId);
  if (!cart) throw new Error("No cart identity");

  // Server-side: verify product exists and get real price
  const { data: product } = await supabase
    .from("products")
    .select("id, price, name, category_id, is_available, is_published")
    .eq("id", item.product_id)
    .maybeSingle();

  if (!product) throw new Error("Product not found");
  if (!product.is_available || !product.is_published) throw new Error("Product unavailable");

  // Verify restaurant_id matches product's restaurant
  const { data: category } = await supabase
    .from("categories")
    .select("restaurant_id")
    .eq("id", product.category_id)
    .maybeSingle();

  if (!category || category.restaurant_id !== item.restaurant_id) {
    throw new Error("Product does not belong to this restaurant");
  }

  // Use server-side price as base (options add to it)
  const serverPrice = Number(product.price);

  let restaurantSwitched = false;

  // Restaurant switch: clear items + update cart
  if (cart.restaurant_id && cart.restaurant_id !== item.restaurant_id) {
    restaurantSwitched = true;
    await supabase.from("cart_items").delete().eq("cart_id", cart.id);
    await supabase
      .from("carts")
      .update({ restaurant_id: item.restaurant_id, order_type: "takeaway", updated_at: new Date().toISOString() })
      .eq("id", cart.id);
  } else if (!cart.restaurant_id) {
    await supabase
      .from("carts")
      .update({ restaurant_id: item.restaurant_id, updated_at: new Date().toISOString() })
      .eq("id", cart.id);
  }

  // Check for existing item with same product + options (deduplication)
  const normalizedNew = normalizeOptions(item.options);
  const { data: existingItems } = await supabase
    .from("cart_items")
    .select("*")
    .eq("cart_id", cart.id)
    .eq("product_id", item.product_id);

  const match = existingItems?.find(
    (ei) => normalizeOptions(Array.isArray(ei.options) ? ei.options : []) === normalizedNew
  );

  // Calculate unit price: base product price + option supplements
  const optionSupplement = Array.isArray(item.options)
    ? item.options.reduce((sum, option) => sum + (Number(option.price) || 0), 0)
    : 0;
  const finalUnitPrice = serverPrice + optionSupplement;

  if (match) {
    // Sum quantity
    await supabase
      .from("cart_items")
      .update({ quantity: match.quantity + item.quantity, unit_price: finalUnitPrice })
      .eq("id", match.id);
  } else {
    const { error } = await supabase
      .from("cart_items")
      .insert({
        cart_id: cart.id,
        product_id: item.product_id,
        product_name: product.name, // Use server-side name
        unit_price: finalUnitPrice,
        quantity: item.quantity,
        options: item.options,
      });
    if (error) throw new Error(`Failed to add item: ${error.message}`);
  }

  // Update cart timestamp
  await supabase.from("carts").update({ updated_at: new Date().toISOString() }).eq("id", cart.id);

  return { restaurant_switched: restaurantSwitched };
}

async function updateItem(
  sessionId: string | null,
  userId: string | null,
  itemId: string,
  updates: {
    product_name?: string;
    unit_price?: number;
    quantity?: number;
    options?: unknown[];
  }
) {
  if (!isValidUUID(itemId)) throw new Error("Invalid item_id");

  const cart = await findActiveCart(sessionId, userId);
  if (!cart) throw new CartItemNotFoundError();
  const { data: existing, error: lookupError } = await supabase
    .from("cart_items")
    .select("id")
    .eq("id", itemId)
    .eq("cart_id", cart.id)
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (!existing) throw new CartItemNotFoundError();

  const updateData: Record<string, unknown> = {};
  if (updates.quantity !== undefined) {
    if (!Number.isInteger(updates.quantity) || updates.quantity < 1 || updates.quantity > 100) throw new Error("Invalid quantity");
    updateData.quantity = updates.quantity;
  }
  if (updates.options !== undefined) {
    if (!Array.isArray(updates.options) || updates.options.length > 30) throw new Error("Invalid options");
    updateData.options = updates.options;
  }
  if (!Object.keys(updateData).length) throw new Error("No valid cart updates");

  const { error } = await supabase
    .from("cart_items")
    .update(updateData)
    .eq("id", itemId)
    .eq("cart_id", cart.id);
  if (error) throw new Error(`Failed to update item: ${error.message}`);
}

class CartItemNotFoundError extends Error {
  constructor() { super("Cart item not found"); }
}

async function requireOwnedCartItem(sessionId: string | null, userId: string | null, itemId: string) {
  const cart = await findActiveCart(sessionId, userId);
  if (!cart) throw new CartItemNotFoundError();
  const { data, error } = await supabase.from("cart_items").select("id").eq("id", itemId).eq("cart_id", cart.id).maybeSingle();
  if (error) throw error;
  if (!data) throw new CartItemNotFoundError();
  return cart;
}

async function updateQuantity(sessionId: string | null, userId: string | null, itemId: string, quantity: number) {
  if (!isValidUUID(itemId)) throw new Error("Invalid item_id");
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > 100) throw new Error("Invalid quantity");
  const cart = await requireOwnedCartItem(sessionId, userId, itemId);

  if (quantity === 0) {
    const { error } = await supabase.from("cart_items").delete().eq("id", itemId).eq("cart_id", cart.id);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from("cart_items")
      .update({ quantity })
      .eq("id", itemId)
      .eq("cart_id", cart.id);
    if (error) throw new Error(`Failed to update quantity: ${error.message}`);
  }
}

async function removeItem(sessionId: string | null, userId: string | null, itemId: string) {
  if (!isValidUUID(itemId)) throw new Error("Invalid item_id");
  const cart = await requireOwnedCartItem(sessionId, userId, itemId);
  const { error } = await supabase.from("cart_items").delete().eq("id", itemId).eq("cart_id", cart.id);
  if (error) throw error;
}

async function clearCart(sessionId: string | null, userId: string | null) {
  const cart = await getOrCreateCart(sessionId, userId);
  if (!cart) return;

  await supabase.from("cart_items").delete().eq("cart_id", cart.id);
  await supabase
    .from("carts")
    .update({ restaurant_id: null, order_type: "takeaway", updated_at: new Date().toISOString() })
    .eq("id", cart.id);
}

async function setOrderType(sessionId: string | null, userId: string | null, orderType: string) {
  const validTypes = ["takeaway", "delivery", "dine_in"];
  if (!validTypes.includes(orderType)) throw new Error("Invalid order_type");

  const cart = await getOrCreateCart(sessionId, userId);
  if (!cart) return;

  await supabase
    .from("carts")
    .update({ order_type: orderType, updated_at: new Date().toISOString() })
    .eq("id", cart.id);
}

/** Use the transactional RPC for merge */
async function mergeCart(sessionId: string, userId: string) {
  const { data, error } = await supabase.rpc("merge_cart_to_user", {
    p_session_id: sessionId,
    p_user_id: userId,
  });

  if (error) {
    console.error("[cart-api] merge RPC error:", error);
    throw new Error(`Merge failed: ${error.message}`);
  }

  return data || { merged: false };
}

// ── Main handler ─────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") return err("Method not allowed", 405);

  try {
    const rawBody = await req.text();
    if (rawBody.length > 50_000) return err("Payload too large", 413);
    let body: Record<string, unknown>;
    try { body = JSON.parse(rawBody); } catch { return err("Invalid JSON"); }
    if (!body || typeof body !== "object" || Array.isArray(body)) return err("Invalid request");
    const { action, session_id, ...params } = body;

    if (!action || typeof action !== "string") {
      return err("Missing or invalid action");
    }
    if (session_id != null && (typeof session_id !== "string" || !isValidUUID(session_id))) {
      return err("Invalid session_id");
    }
    const safeSessionId = typeof session_id === "string" ? session_id : null;

    // Extract user from JWT if present
    let jwtUserId: string | null = null;
    const authHeader = req.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      if (tokenHasSubject(token)) {
        try {
          const { data: { user } } = await createClient(supabaseUrl, serviceRoleKey)
            .auth.getUser(token);
          if (user && !user.is_anonymous) {
            jwtUserId = user.id;
          }
        } catch {
          // Invalid token, continue as guest
        }
      }
    }

    const identity = jwtUserId ? `user:${jwtUserId}` : typeof session_id === "string" ? `session:${session_id}` : null;
    if (identity) {
      try {
        const clientIp = getTrustedClientIp(req);
        const allowed = clientIp
          ? await consumeRequestRateLimitPair(supabase, serviceRoleKey, "cart-api", identity, 120, `ip:${clientIp}`, 300, 60)
          : await consumeRequestRateLimit(supabase, serviceRoleKey, "cart-api", identity, 120, 60);
        if (!allowed) return err("Trop de requêtes panier. Réessayez dans un instant.", 429);
      } catch {
        return err("Service temporairement indisponible", 503);
      }
    } else {
      const clientIp = getTrustedClientIp(req);
      if (clientIp) {
        try {
          if (!await consumeRequestRateLimit(supabase, serviceRoleKey, "cart-api", `ip:${clientIp}`, 600, 60)) {
            return err("Trop de requêtes panier. Réessayez dans un instant.", 429);
          }
        } catch {
          return err("Service temporairement indisponible", 503);
        }
      }
    }

    switch (action) {
      case "get": {
        const result = await getCart(safeSessionId, jwtUserId);
        return json(result);
      }

      case "add": {
        const parsedItem = parseAddItem(params.item);
        if ("error" in parsedItem) return err(parsedItem.error);

        const result = await addItem(safeSessionId, jwtUserId, parsedItem.item);
        const cart = await getCart(safeSessionId, jwtUserId);
        return json({ ...cart, restaurant_switched: result.restaurant_switched });
      }

      case "update_item": {
        if (!isValidUUID(params.item_id)) return err("Invalid item_id");
        await updateItem(safeSessionId, jwtUserId, params.item_id, isRecord(params.updates) ? params.updates : {});
        const cart = await getCart(safeSessionId, jwtUserId);
        return json(cart);
      }

      case "update_quantity": {
        if (!isValidUUID(params.item_id)) return err("Invalid item_id");
        if (typeof params.quantity !== "number") return err("Invalid quantity");
        await updateQuantity(safeSessionId, jwtUserId, params.item_id, params.quantity);
        const cart = await getCart(safeSessionId, jwtUserId);
        return json(cart);
      }

      case "remove": {
        if (!isValidUUID(params.item_id)) return err("Invalid item_id");
        await removeItem(safeSessionId, jwtUserId, params.item_id);
        const cart = await getCart(safeSessionId, jwtUserId);
        return json(cart);
      }

      case "clear": {
        await clearCart(safeSessionId, jwtUserId);
        return json({ cart: null, items: [] });
      }

      case "set_order_type": {
        if (typeof params.order_type !== "string") return err("Missing or invalid order_type");
        await setOrderType(safeSessionId, jwtUserId, params.order_type);
        const cart = await getCart(safeSessionId, jwtUserId);
        return json(cart);
      }

      case "merge": {
        if (!safeSessionId || !jwtUserId) {
          return err("merge requires session_id and authenticated user");
        }
        const mergeResult = await mergeCart(safeSessionId, jwtUserId);
        const cart = await getCart(null, jwtUserId);
        return json({ ...cart, ...mergeResult });
      }

      default:
        return err(`Unknown action: ${action}`);
    }
  } catch (error) {
    console.error("[cart-api] unhandled error", {
      message: error instanceof Error ? error.message : String(error),
    });
    if (error instanceof CartItemNotFoundError) return err("L’article n’existe pas dans ce panier.", 404);
    const message = error instanceof Error ? error.message : "";
    if (/^(Invalid |Missing |No valid |Unknown action|Quantity )/i.test(message)) return err(message, 400);
    return err("Panier temporairement indisponible.", 500);
  }
});
