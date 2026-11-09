import type { CartItem } from "@/contexts/CartContext";
const API_URL = import.meta.env.VITE_SUPABASE_URL;
const KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const SESSION_KEY = `digital-menu:${new URL(API_URL).hostname}`;
const ORDER_PREFIX = `${SESSION_KEY}:order:`;
const ORDER_INDEX_KEY = `${SESSION_KEY}:orders`;
export interface MenuSession { token: string; cart_session_id: string; restaurant_id: string; order_id?: string; }
export function markMenuOrder(orderId: string) {
  const session = readMenuSession();
  if (session) {
    const receipt = { ...session, order_id: orderId };
    try {
      localStorage.setItem(`${ORDER_PREFIX}${orderId}`, JSON.stringify(receipt));
      const ids = readMenuOrderIds().filter((id) => id !== orderId);
      localStorage.setItem(ORDER_INDEX_KEY, JSON.stringify([orderId, ...ids].slice(0, 20)));
    } catch { /* Private browsing may disable persistent storage; current tab still works. */ }
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(receipt));
  }
}
export function readMenuReceipt(orderId: string): MenuSession | null {
  try {
    const receipt = JSON.parse(localStorage.getItem(`${ORDER_PREFIX}${orderId}`) || "null");
    if (receipt?.token && receipt.order_id === orderId) return receipt;
  } catch { /* continue with session storage */ }
  try {
    const receipt = JSON.parse(sessionStorage.getItem(`${ORDER_PREFIX}${orderId}`) || "null");
    if (receipt?.token && receipt.order_id === orderId) return receipt;
  } catch { /* continue with the current session */ }
  const current = readMenuSession();
  return current?.order_id === orderId ? current : null;
}
export function readMenuOrderIds(): string[] {
  try {
    const ids: unknown = JSON.parse(localStorage.getItem(ORDER_INDEX_KEY) || "[]");
    return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string" && /^[a-f\d-]{36}$/i.test(id)).slice(0, 20) : [];
  } catch { return []; }
}
export function readMenuSession(): MenuSession | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");
    return value?.token && value.cart_session_id === localStorage.getItem("rzfood_cart_session_id") ? value : null;
  } catch { return null; }
}
async function call(body: Record<string, unknown>) {
  const response = await fetch(`${API_URL}/functions/v1/digital-menu`, { method: "POST", headers: { apikey: KEY, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok || data.error) throw new Error(data.error || "Service indisponible");
  return data;
}
export async function prepareMenuCart(slug: string, orderType: string, items: Omit<CartItem,"id">[], tableToken?: string, tableNumber?: number) {
  let clientSessionId = localStorage.getItem("rzfood_cart_session_id");
  if (!clientSessionId || !/^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(clientSessionId)) {
    clientSessionId = crypto.randomUUID();
    localStorage.setItem("rzfood_cart_session_id", clientSessionId);
  }
  const data = await call({ action: "prepare", client_session_id: clientSessionId, table_token: tableToken, table_number: tableNumber, slug, order_type: orderType, items: items.map((i) => ({ product_id: i.product_id, quantity: i.quantity, options: i.options })) });
  const previous = readMenuSession();
  if (previous?.order_id) markMenuOrder(previous.order_id);
  localStorage.setItem("rzfood_cart_session_id", data.cart_session_id);
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(data));
  sessionStorage.setItem("rzfood_order_source", "qr");
  if (data.table_number && orderType === "dine_in") sessionStorage.setItem("rzfood_table_number", String(data.table_number));
  else sessionStorage.removeItem("rzfood_table_number");
  sessionStorage.removeItem("rzfood_scheduled_at");
}
export async function fetchMenuOrder(orderId: string) {
  const session = readMenuReceipt(orderId);
  if (!session) return null;
  const data = await call({ action: "status", token: session.token, order_id: orderId });
  return data.order;
}

export async function fetchLocalMenuOrders() {
  const ids = readMenuOrderIds();
  const results = await Promise.all(ids.map(async (id) => {
    try { return await fetchMenuOrder(id); } catch { return null; }
  }));
  return results.filter((order): order is NonNullable<typeof order> => !!order)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}
