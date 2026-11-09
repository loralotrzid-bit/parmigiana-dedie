import { beforeEach, expect, it } from "vitest";
import { markMenuOrder, readMenuReceipt } from "@/services/digitalMenuService";
const key = `digital-menu:${new URL(import.meta.env.VITE_SUPABASE_URL).hostname}`;
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
it("keeps a private receipt accessible after starting another cart", () => {
  localStorage.setItem("rzfood_cart_session_id", "first-cart");
  sessionStorage.setItem(key, JSON.stringify({ token: "private-token", cart_session_id: "first-cart", restaurant_id: "restaurant" }));
  markMenuOrder("first-order");
  localStorage.setItem("rzfood_cart_session_id", "next-cart");
  sessionStorage.setItem(key, JSON.stringify({ token: "next-token", cart_session_id: "next-cart", restaurant_id: "restaurant" }));
  expect(readMenuReceipt("first-order")?.token).toBe("private-token");
});
it("does not use a guest credential for an unrelated normal order", () => {
  localStorage.setItem("rzfood_cart_session_id", "cart");
  sessionStorage.setItem(key, JSON.stringify({ token: "private-token", cart_session_id: "cart", order_id: "guest-order" }));
  expect(readMenuReceipt("normal-order")).toBeNull();
});
