import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Subscribes to realtime changes on all orders for a restaurant.
 * Handles INSERT (new orders) and UPDATE (status changes).
 */
export function useRealtimeOrders(restaurantId: string | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!restaurantId) return;

    const channel = supabase
      .channel(`orders:restaurant:${restaurantId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "orders",
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        () => {
          // Refetch to get full order with items & choices
          queryClient.invalidateQueries({ queryKey: ["admin-orders", restaurantId] });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "orders",
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        () => {
          // Refetch to preserve items & choices structure
          queryClient.invalidateQueries({ queryKey: ["admin-orders", restaurantId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [restaurantId, queryClient]);
}
