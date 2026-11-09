import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

/**
 * Subscribes to realtime changes on a single order.
 * Updates the React Query cache so the UI refreshes instantly.
 */
export function useRealtimeOrder(orderId: string | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!orderId) return;

    const channel = supabase
      .channel(`order:${orderId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "orders",
          filter: `id=eq.${orderId}`,
        },
        (payload) => {
          queryClient.setQueryData<Tables<"orders"> | undefined>(["order", orderId], (old) => {
            if (!old) return old;
            return { ...old, ...payload.new };
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orderId, queryClient]);
}
