/**
 * Backend-driven cart service.
 * All cart state lives in Supabase; this service is the single gateway.
 */
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunctionDirect, shouldUseEdgeFetchFallback } from "@/lib/edgeFunctionFallback";
import { withTimeout } from "@/lib/apiTimeout";
import { logger } from "@/lib/logger";
import { readMenuSession } from "@/services/digitalMenuService";

const SESSION_KEY = "rzfood_cart_session_id";

/** Persistent anonymous session id (survives refresh, not tied to auth) */
export function getCartSessionId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

export function clearCartSessionId() {
  if (typeof window !== "undefined") {
    localStorage.removeItem(SESSION_KEY);
  }
}

export interface CartItemOption {
  name: string;
  price: number;
}

export interface CartItemRow {
  id: string;
  cart_id: string;
  product_id: string;
  product_name: string;
  unit_price: number;
  quantity: number;
  options: CartItemOption[];
  created_at: string;
}

export interface CartRow {
  id: string;
  user_id: string | null;
  session_id: string | null;
  restaurant_id: string | null;
  order_type: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface CartState {
  cart: CartRow | null;
  items: CartItemRow[];
  restaurant_switched?: boolean;
  merged?: boolean;
}

async function callCartApi(body: Record<string, unknown>): Promise<CartState> {
  const sessionId = getCartSessionId();
  const payload = { session_id: sessionId, ...body };

  logger.debug("[cartService]", body.action, { session_id: sessionId });
  if (readMenuSession()) {
    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cart-api`, {
      method: "POST", headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok || data.error) throw new Error(data.error || "Panier indisponible");
    return data as CartState;
  }

  try {
    const data = await withTimeout(async (signal) => {
      const { data, error } = await supabase.functions.invoke("cart-api", {
        body: payload,
        signal,
      });

      if (error) throw error;
      if (!data) throw new Error("Cart API returned empty response");
      return data as CartState;
    });

    logger.debug("[cartService] response:", body.action);
    return data;
  } catch (error) {
    if (!shouldUseEdgeFetchFallback(error)) {
      logger.error("[cartService] cart-api error:", error);
      throw new Error(error instanceof Error ? error.message : "Cart API error");
    }

    logger.debug("[cartService] using direct fetch fallback");
    const fallbackData = await withTimeout((signal) =>
      invokeEdgeFunctionDirect<CartState>("cart-api", payload, signal)
    );
    return fallbackData;
  }
}

export async function fetchCart(): Promise<CartState> {
  return callCartApi({ action: "get" });
}

export async function addCartItem(item: {
  restaurant_id: string;
  product_id: string;
  product_name: string;
  unit_price: number;
  quantity: number;
  options: CartItemOption[];
}): Promise<CartState> {
  return callCartApi({ action: "add", item });
}

export async function updateCartItem(
  itemId: string,
  updates: {
    product_name?: string;
    unit_price?: number;
    quantity?: number;
    options?: CartItemOption[];
  }
): Promise<CartState> {
  return callCartApi({ action: "update_item", item_id: itemId, updates });
}

export async function updateCartItemQuantity(
  itemId: string,
  quantity: number
): Promise<CartState> {
  return callCartApi({ action: "update_quantity", item_id: itemId, quantity });
}

export async function removeCartItem(itemId: string): Promise<CartState> {
  return callCartApi({ action: "remove", item_id: itemId });
}

export async function clearCartBackend(): Promise<CartState> {
  return callCartApi({ action: "clear" });
}

export async function setCartOrderType(orderType: string): Promise<CartState> {
  return callCartApi({ action: "set_order_type", order_type: orderType });
}

export async function mergeCartAfterLogin(): Promise<CartState> {
  return callCartApi({ action: "merge" });
}
