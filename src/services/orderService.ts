import { supabase } from "@/integrations/supabase/client";
import { FunctionsHttpError, FunctionsRelayError, FunctionsFetchError } from "@supabase/supabase-js";
import type { CartItem } from "@/contexts/CartContext";
import { getCurrentSession, isValidSession } from "@/lib/authSession";
import { invokeEdgeFunctionDirect, isFunctionsFetchError, shouldUseEdgeFetchFallback } from "@/lib/edgeFunctionFallback";
import { safeSupabaseCall, safeSupabaseCallOrThrow } from "@/lib/safeSupabaseCall";
import { dbg } from "@/lib/debugLog";
import { readMenuSession, readMenuReceipt, fetchMenuOrder } from "@/services/digitalMenuService";
import type { Tables } from "@/integrations/supabase/types";

interface CreateOrderOptions {
  requestId?: string;
  note?: string;
  orderSource?: string;
  tableNumber?: number;
  paymentMethod?: string;
  cashDetails?: { counts: Record<number, number>; total: number } | null;
  deliveryAddress?: string;
  deliveryPostcode?: string;
  deliveryLat?: number;
  deliveryLng?: number;
  clientPhone?: string;
  scheduledAt?: string;
}

export interface CreatedOrder {
  id: string;
  order_number: number;
  created_at: string;
  total: number;
  [key: string]: unknown;
}

function toCreatedOrder(value: unknown): CreatedOrder {
  if (!value || typeof value !== "object") throw new Error("Réponse commande invalide");
  const c = value as Record<string, unknown>;
  if (typeof c.id !== "string" || typeof c.order_number !== "number" || typeof c.created_at !== "string" || typeof c.total !== "number") {
    throw new Error("Réponse commande invalide");
  }
  return c as CreatedOrder;
}

async function resolveAuthenticatedSession() {
  const session = await getCurrentSession({ allowRefresh: true, allowStorageFallback: true });
  return isValidSession(session) ? session : null;
}

async function getAuthenticatedUserId(): Promise<string> {
  try {
    const session = await resolveAuthenticatedSession();
    if (!session?.user || session.user.is_anonymous) throw new Error("Vous devez être connecté pour passer une commande");
    return session.user.id;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? "");
    if (message.includes("Navigator LockManager") || message.includes("auth-token")) {
      throw new Error("Session temporairement indisponible, réessayez dans 1 seconde.");
    }
    throw error;
  }
}

export async function createOrder(
  restaurantId: string,
  items: CartItem[],
  orderType: string = "takeaway",
  options: CreateOrderOptions = {}
): Promise<CreatedOrder> {
  const menuSession = readMenuSession();
  const isStaffOrder = options.orderSource === "pos" || options.orderSource === "phone" || options.orderSource === "server";
  const isMenuGuest = !isStaffOrder && menuSession?.restaurant_id === restaurantId && !menuSession.order_id;
  const userId = isMenuGuest ? menuSession.cart_session_id : await getAuthenticatedUserId();
  const { note, orderSource = "direct", tableNumber, paymentMethod, cashDetails, deliveryAddress, deliveryPostcode, deliveryLat, deliveryLng, clientPhone, scheduledAt } = options;

  const payload = {
    request_id: options.requestId,
    restaurant_id: restaurantId,
    guest_session_id: userId,
    menu_session_token: isMenuGuest ? menuSession.token : undefined,
    order_type: orderType,
    order_source: orderSource,
    note: note || null,
    table_number: tableNumber || null,
    payment_method: paymentMethod || "cash",
    cash_details: cashDetails || null,
    delivery_address: deliveryAddress || null,
    delivery_postcode: deliveryPostcode || null,
    delivery_lat: deliveryLat || null,
    delivery_lng: deliveryLng || null,
    client_phone: clientPhone || null,
    scheduled_at: scheduledAt || null,
    items: items.map((item) => ({
      product_id: item.product_id,
      product_name: item.product_name,
      quantity: item.quantity,
      unit_price: item.unit_price,
      options: item.options,
    })),
  };

  const createOrderViaFallback = async () => {
    const fallbackData = await invokeEdgeFunctionDirect<{ order?: unknown; error?: string }>("create-order", payload);
    if (fallbackData?.error) throw new Error(fallbackData.error);
    if (!fallbackData?.order) throw new Error("Réponse commande invalide");
    return toCreatedOrder(fallbackData.order);
  };

  let data: unknown;
  let error: unknown;

  try {
    dbg("supabase", "SDK call [orderService/createOrder]", undefined, "info");
    const result = await supabase.functions.invoke("create-order", { body: payload });
    data = result.data;
    error = result.error;
  } catch (invokeError) {
    if (shouldUseEdgeFetchFallback(invokeError)) {
      console.warn("[OrderService] invoke transport failed, fallback to direct fetch", invokeError);
      return createOrderViaFallback();
    }
    throw invokeError;
  }

  if (error) {
    if (isFunctionsFetchError(error) || shouldUseEdgeFetchFallback(error)) {
      console.warn("[OrderService] invoke fetch error, fallback to direct fetch", error);
      return createOrderViaFallback();
    }
    if (error instanceof FunctionsHttpError) {
      try {
        const errorBody = await error.context.json();
        if (errorBody?.error) throw new Error(errorBody.error);
      } catch (parseError) {
        const parseMessage = parseError instanceof Error ? parseError.message : "";
        if (parseMessage && parseMessage !== error.message) throw parseError;
      }
    }
    console.error("[OrderService] Full error:", error);
    throw error;
  }

  const typedData = data as { error?: string; order?: unknown } | null;
  if (typedData?.error) throw new Error(typedData.error);
  if (!typedData?.order) throw new Error("Réponse commande invalide");
  return toCreatedOrder(typedData.order);
}

export async function fetchOrderById(orderId: string) {
  if (readMenuReceipt(orderId)) return fetchMenuOrder(orderId);
  const order = await safeSupabaseCallOrThrow(
    "orderService/fetchById",
    () => supabase.from("orders").select("*").eq("id", orderId).single(),
    { allowPassive: true }
  );

  const items = (await safeSupabaseCallOrThrow(
    "orderService/fetchById/items",
    () => supabase.from("order_items").select("*").eq("order_id", orderId),
    { allowPassive: true }
  ));

  const itemIds = items.map((item) => item.id);
  let choices: Tables<"order_item_choices">[] = [];
  if (itemIds.length > 0) {
    const ch = await safeSupabaseCall(
      "orderService/fetchById/choices",
      () => supabase.from("order_item_choices").select("*").in("order_item_id", itemIds)
    );
    choices = ch ?? [];
  }

  return {
    ...order,
    items: items.map((item) => ({
      ...item,
      choices: choices.filter((choice) => choice.order_item_id === item.id),
    })),
  };
}

export async function fetchMyOrders(userId?: string) {
  let resolvedUserId = userId;
  if (!resolvedUserId) {
    const session = await resolveAuthenticatedSession();
    resolvedUserId = session?.user?.id;
  }
  if (!resolvedUserId) return [];

  const orders = (await safeSupabaseCall(
    "orderService/fetchMyOrders",
    () => supabase.from("orders")
      .select("id, order_number, status, order_type, total, created_at, restaurant_id")
      .eq("guest_session_id", resolvedUserId!)
      .order("created_at", { ascending: false })
      .limit(50)
  ));

  if (!orders || orders.length === 0) return [];

  const orderIds = orders.map((order) => order.id);
  const items = (await safeSupabaseCall(
    "orderService/fetchMyOrders/items",
    () => supabase.from("order_items").select("order_id, product_name, quantity").in("order_id", orderIds)
  ));

  const restoIds = [...new Set(orders.map((order) => order.restaurant_id))];
  const restos = (await safeSupabaseCall(
    "orderService/fetchMyOrders/restos",
    () => supabase.from("public_restaurants").select("id, name, logo_url").in("id", restoIds)
  ));

  const restoMap = new Map((restos || []).map((restaurant) => [restaurant.id, restaurant]));
  return orders.map((order) => ({
    ...order,
    items: (items || []).filter((item) => item.order_id === order.id),
    restaurant: restoMap.get(order.restaurant_id) || null,
  }));
}

export async function fetchOrdersByRestaurant(restaurantId: string) {
  return safeSupabaseCallOrThrow(
    "orderService/fetchByRestaurant",
    () => supabase.from("orders").select("*").eq("restaurant_id", restaurantId).order("created_at", { ascending: false })
  );
}

export async function fetchOrdersWithItems(restaurantId: string) {
  const orders = (await safeSupabaseCallOrThrow(
    "orderService/fetchWithItems",
    () => supabase.from("orders").select("*").eq("restaurant_id", restaurantId).order("created_at", { ascending: false })
  ));

  if (!orders || orders.length === 0) return [];
  const orderIds = orders.map((order) => order.id);

  const items = (await safeSupabaseCallOrThrow(
    "orderService/fetchWithItems/items",
    () => supabase.from("order_items").select("*").in("order_id", orderIds)
  ));

  const choices: Tables<"order_item_choices">[] = [];
  if (items && items.length > 0) {
    const itemIds = items.map((item) => item.id);
    const batchSize = 500;
    for (let i = 0; i < itemIds.length; i += batchSize) {
      const batch = itemIds.slice(i, i + batchSize);
      const ch = (await safeSupabaseCall(
        "orderService/fetchWithItems/choices",
        () => supabase.from("order_item_choices").select("*").in("order_item_id", batch)
      ));
      if (ch) choices.push(...ch);
    }
  }

  return orders.map((order) => {
    const orderItems = items.filter((item) => item.order_id === order.id);
    return { ...order, items: orderItems.map((item) => ({ ...item, choices: choices.filter((choice) => choice.order_item_id === item.id) })) };
  });
}

export async function updateOrderStatus(orderId: string, status: string, prepMinutes?: number, estimatedDeliveryAt?: string) {
  const extras: { accepted_at?: string; estimated_delivery_at?: string; ready_at?: string } = {};
  if (status === "preparing") {
    const now = new Date();
    extras.accepted_at = now.toISOString();
    if (estimatedDeliveryAt) {
      extras.estimated_delivery_at = estimatedDeliveryAt;
    } else if (prepMinutes) {
      extras.estimated_delivery_at = new Date(now.getTime() + prepMinutes * 60000).toISOString();
    } else {
      // Delivery default requested by La Parmigiana: one hour from acceptance.
      extras.estimated_delivery_at = new Date(now.getTime() + 60 * 60000).toISOString();
    }
  } else if (status === "ready" || status === "waiting_delivery") {
    extras.ready_at = new Date().toISOString();
  }

  const runUpdate = (allowPassive = false) => safeSupabaseCallOrThrow(
    "orderService/updateStatus",
    () => supabase.from("orders").update({ status, ...extras }).eq("id", orderId).select().single(),
    { allowPassive }
  );

  try {
    return await runUpdate(false);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? "");
    if (message.includes("onglet passif")) {
      dbg("supabase", "Retry orderService/updateStatus with allowPassive override", { orderId, status }, "info");
      return runUpdate(true);
    }
    throw error;
  }
}

export async function cancelOrder(orderId: string) {
  return updateOrderStatus(orderId, "cancelled");
}

export async function deleteAllOrders(restaurantId: string) {
  const orders = (await safeSupabaseCallOrThrow(
    "orderService/deleteAll",
    () => supabase.from("orders").select("id").eq("restaurant_id", restaurantId),
    { allowPassive: true }
  ));

  if (!orders || orders.length === 0) return;
  const orderIds = orders.map((order) => order.id);
  await deleteOrdersByIds(orderIds);
}

export async function deleteOrdersByIds(orderIds: string[]) {
  if (!orderIds || orderIds.length === 0) return;

  const items = (await safeSupabaseCall(
    "orderService/deleteByIds/items",
    () => supabase.from("order_items").select("id").in("order_id", orderIds),
    { allowPassive: true }
  ));

  if (items && items.length > 0) {
    const itemIds = items.map((item) => item.id);
    await safeSupabaseCall("orderService/deleteByIds/choices", () => supabase.from("order_item_choices").delete().in("order_item_id", itemIds), { allowPassive: true });
  }

  await safeSupabaseCall("orderService/deleteByIds/orderItems", () => supabase.from("order_items").delete().in("order_id", orderIds), { allowPassive: true });
  await safeSupabaseCall("orderService/deleteByIds/assignments", () => supabase.from("delivery_assignments").delete().in("order_id", orderIds), { allowPassive: true });
  await safeSupabaseCall("orderService/deleteByIds/chat", () => supabase.from("chat_messages").delete().in("order_id", orderIds), { allowPassive: true });
  await safeSupabaseCall("orderService/deleteByIds/alerts", () => supabase.from("admin_alerts").delete().in("order_id", orderIds), { allowPassive: true });

  await safeSupabaseCallOrThrow(
    "orderService/deleteByIds/orders",
    () => supabase.from("orders").delete().in("id", orderIds),
    { allowPassive: true }
  );
}
