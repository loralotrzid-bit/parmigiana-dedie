import { useState, useEffect, type ReactNode, useCallback, useRef } from "react";
import { CartContext, type CartItem } from "@/contexts/cartContextStore";
export type { CartItem } from "@/contexts/cartContextStore";
import { useAuth } from "@/contexts/useAuth";
import { safeToast } from "@/lib/safeToast";
import { logger } from "@/lib/logger";
import { readMenuSession } from "@/services/digitalMenuService";
import {
  fetchCart,
  addCartItem,
  updateCartItem as updateCartItemApi,
  updateCartItemQuantity,
  removeCartItem,
  clearCartBackend,
  setCartOrderType,
  mergeCartAfterLogin,
  type CartItemRow,
  type CartItemOption,
  type CartState,
} from "@/services/cartService";

export type { CartItemOption };

/** Deduplicate items with same product_id + options by merging quantities */
function dedupeItems(items: CartItem[]): CartItem[] {
  const map = new Map<string, CartItem>();
  for (const item of items) {
    const key = item.product_id + JSON.stringify(
      [...(item.options || [])].sort((a, b) => (a.name || "").localeCompare(b.name || ""))
    );
    const existing = map.get(key);
    if (existing) {
      existing.quantity += item.quantity;
    } else {
      map.set(key, { ...item });
    }
  }
  return Array.from(map.values());
}

function rowsToItems(rows: CartItemRow[], restaurantId: string | null): CartItem[] {
  return rows.map((r) => ({
    id: r.id,
    restaurant_id: restaurantId || "",
    product_id: r.product_id,
    product_name: r.product_name,
    options: (r.options || []) as CartItemOption[],
    unit_price: Number(r.unit_price),
    quantity: r.quantity,
  }));
}

export function CartProvider({ children }: { children: ReactNode }) {
  const { user, isLoading: authLoading } = useAuth();
  const [items, setItems] = useState<CartItem[]>([]);
  const [orderType, setOrderTypeState] = useState("takeaway");
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [scheduledAt, setScheduledAtState] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem("rzfood_scheduled_at");
    } catch {
      return null;
    }
  });
  const mergeInFlightRef = useRef(false);
  const prevUserIdRef = useRef<string | null>(null);

  const setScheduledAt = useCallback((value: string | null) => {
    setScheduledAtState(value);
    try {
      if (value) sessionStorage.setItem("rzfood_scheduled_at", value);
      else sessionStorage.removeItem("rzfood_scheduled_at");
    } catch {
      // ignore storage issues
    }
  }, []);

  const applyState = useCallback((state: CartState) => {
    const rid = state.cart?.restaurant_id || null;
    setRestaurantId(rid);
    setOrderTypeState(state.cart?.order_type || "takeaway");
    if (rid === null) {
      setScheduledAt(null);
    }
    // Deduplicate before setting state to prevent UI duplicates
    setItems(dedupeItems(rowsToItems(state.items, rid)));
  }, [setScheduledAt]);

  const refreshCart = useCallback(async () => {
    setIsLoading(true);
    try {
      applyState(await fetchCart());
    } finally {
      setIsLoading(false);
    }
  }, [applyState]);

  // Initial load
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const state = await fetchCart();
        if (!cancelled) applyState(state);
      } catch (err) {
        logger.warn("[Cart] Initial load failed:", err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [applyState]);

  // Handle auth changes: merge on login, reset on logout
  useEffect(() => {
    if (authLoading) return;
    if (readMenuSession()) return;
    const currentUserId = user?.id || null;
    const wasGuest = !prevUserIdRef.current;
    const justLoggedIn = wasGuest && !!currentUserId;
    const userSwitched = prevUserIdRef.current && currentUserId && prevUserIdRef.current !== currentUserId;
    const justLoggedOut = !!prevUserIdRef.current && !currentUserId;

    prevUserIdRef.current = currentUserId;

    // ── Sign-out: reset local state, reload fresh session cart ──
    if (justLoggedOut) {
      setItems([]);
      setRestaurantId(null);
      setOrderTypeState("takeaway");
      setScheduledAt(null);
      mergeInFlightRef.current = false;
      // Reload cart for the new anonymous session
      fetchCart()
        .then((state) => applyState(state))
        .catch(() => {});
      return;
    }

    // ── Sign-in: merge session cart into user cart ──
    if ((justLoggedIn || userSwitched) && currentUserId && !mergeInFlightRef.current) {
      mergeInFlightRef.current = true;
      setIsLoading(true); // Show loading state during merge to prevent 0€ flash
      // Capture current item count from ref-stable source
      const preLoginItemCount = items.length;

      const doMerge = async () => {
        try {
          const state = await mergeCartAfterLogin();
          logger.debug("[Cart] merge result", {
            preLoginItemCount,
            afterMerge: state.items?.length,
            merged: state.merged,
          });
          applyState(state);

          // Anti-loss: retry if items were lost
          if (preLoginItemCount > 0 && (!state.items || state.items.length === 0) && !state.merged) {
            logger.warn("[Cart] Merge returned empty despite pre-login items, retrying…");
            await new Promise((resolve) => setTimeout(resolve, 500));
            const retryState = await mergeCartAfterLogin();
            applyState(retryState);

            if (!retryState.items || retryState.items.length === 0) {
              await new Promise((resolve) => setTimeout(resolve, 300));
              try { applyState(await fetchCart()); } catch { /* ignore */ }
            }
          } else {
            try {
              applyState(await fetchCart());
            } catch {
              await new Promise((resolve) => setTimeout(resolve, 350));
              try { applyState(await fetchCart()); } catch { /* ignore */ }
            }
          }
        } catch (err) {
          logger.warn("[Cart] Merge failed:", err);
          try {
            await new Promise((resolve) => setTimeout(resolve, 300));
            applyState(await fetchCart());
          } catch { /* ignore */ }
        } finally {
          mergeInFlightRef.current = false;
          setIsLoading(false);
        }
      };
      void doMerge();
    }

    if (!currentUserId) mergeInFlightRef.current = false;
  }, [authLoading, user?.id, applyState, items.length, setScheduledAt]);

  const addItem = useCallback((item: Omit<CartItem, "id">) => {
    // Input validation
    if (!item.restaurant_id || !item.product_id || !item.quantity || item.quantity < 1) {
      logger.warn("[Cart] addItem: invalid input, skipping");
      return;
    }
    if (typeof item.unit_price !== "number" || isNaN(item.unit_price)) {
      logger.warn("[Cart] addItem: invalid unit_price, skipping");
      return;
    }

    const tempId = crypto.randomUUID();
    const currentRestaurantId = restaurantId;
    setItems((prev) => dedupeItems([...prev, { ...item, id: tempId }]));

    const doAdd = async () => {
      try {
        let state = await addCartItem({
          restaurant_id: item.restaurant_id,
          product_id: item.product_id,
          product_name: item.product_name,
          unit_price: item.unit_price,
          quantity: item.quantity,
          options: item.options,
        });

        if (!state?.cart) {
          await new Promise((resolve) => setTimeout(resolve, 250));
          state = await addCartItem({
            restaurant_id: item.restaurant_id,
            product_id: item.product_id,
            product_name: item.product_name,
            unit_price: item.unit_price,
            quantity: item.quantity,
            options: item.options,
          });
        }

        if (state.restaurant_switched && currentRestaurantId) {
          setScheduledAt(null);
          safeToast.info("Nouveau restaurant", {
            description: "Votre panier a été mis à jour pour le nouveau restaurant.",
            icon: "🔄",
          });
        }
        applyState(state);
      } catch (err) {
        logger.error("[Cart] addItem failed:", err);
        setItems((prev) => prev.filter((i) => i.id !== tempId));
        try { applyState(await fetchCart()); } catch { /* ignore */ }
        safeToast.error("Impossible d'ajouter l'article", {
          description: err instanceof Error ? err.message : "Erreur réseau temporaire",
        });
      }
    };
    void doAdd();
  }, [restaurantId, applyState, setScheduledAt]);

  const updateItem = useCallback((id: string, item: Omit<CartItem, "id">) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...item, id } : i)));
    const doUpdate = async () => {
      try {
        const state = await updateCartItemApi(id, {
          product_name: item.product_name,
          unit_price: item.unit_price,
          quantity: item.quantity,
          options: item.options,
        });
        applyState(state);
      } catch (err) {
        logger.error("[Cart] updateItem failed:", err);
        try { applyState(await fetchCart()); } catch { /* ignore */ }
      }
    };
    void doUpdate();
  }, [applyState]);

  const updateQuantity = useCallback((id: string, quantity: number) => {
    if (quantity <= 0) {
      setItems((prev) => prev.filter((i) => i.id !== id));
    } else {
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, quantity } : i)));
    }
    const doUpdate = async () => {
      try {
        const state = await updateCartItemQuantity(id, quantity);
        applyState(state);
      } catch (err) {
        logger.error("[Cart] updateQuantity failed:", err);
        try { applyState(await fetchCart()); } catch { /* ignore */ }
      }
    };
    void doUpdate();
  }, [applyState]);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    const doRemove = async () => {
      try {
        const state = await removeCartItem(id);
        applyState(state);
      } catch (err) {
        logger.error("[Cart] removeItem failed:", err);
        try { applyState(await fetchCart()); } catch { /* ignore */ }
      }
    };
    void doRemove();
  }, [applyState]);

  const clearCart = useCallback(() => {
    setItems([]);
    setRestaurantId(null);
    setOrderTypeState("takeaway");
    setScheduledAt(null);
    const doClear = async () => {
      try { await clearCartBackend(); }
      catch (err) { logger.error("[Cart] clearCart failed:", err); }
    };
    void doClear();
  }, [setScheduledAt]);

  const setOrderType = useCallback((type: string) => {
    setOrderTypeState(type);
    const doSet = async () => {
      try { await setCartOrderType(type); }
      catch (err) { logger.error("[Cart] setOrderType failed:", err); }
    };
    void doSet();
  }, []);

  const total = items.reduce((s, i) => s + i.unit_price * i.quantity, 0);
  const itemCount = items.reduce((s, i) => s + i.quantity, 0);

  return (
    <CartContext.Provider
      value={{ items, addItem, updateItem, updateQuantity, removeItem, clearCart, total, itemCount, orderType, setOrderType, isLoading, currentRestaurantId: restaurantId, scheduledAt, setScheduledAt, refreshCart }}
    >
      {children}
    </CartContext.Provider>
  );
}
