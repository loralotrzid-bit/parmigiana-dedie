import { createContext } from "react";
import type { CartItemOption } from "@/services/cartService";

export interface CartItem {
  id: string;
  restaurant_id: string;
  product_id: string;
  product_name: string;
  options: CartItemOption[];
  unit_price: number;
  quantity: number;
}

export interface CartContextType {
  items: CartItem[];
  addItem: (item: Omit<CartItem, "id">) => void;
  updateItem: (id: string, item: Omit<CartItem, "id">) => void;
  updateQuantity: (id: string, quantity: number) => void;
  removeItem: (id: string) => void;
  clearCart: () => void;
  total: number;
  itemCount: number;
  orderType: string;
  setOrderType: (type: string) => void;
  isLoading: boolean;
  currentRestaurantId: string | null;
  scheduledAt: string | null;
  setScheduledAt: (value: string | null) => void;
  refreshCart: () => Promise<void>;
}

export const CartContext = createContext<CartContextType | null>(null);
