import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export async function fetchChatMessages(orderId: string) {
  const { data, error } = await supabase
    .from("chat_messages")
    .select("*")
    .eq("order_id", orderId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data;
}

export async function sendChatMessage(
  orderId: string,
  senderType: "client" | "restaurant" | "driver",
  senderId: string,
  message: string,
  targetType?: "restaurant" | "driver"
) {
  // Sanitize message — strip HTML, scripts, limit length
  const sanitized = message
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]*>/g, "")
    .replace(/javascript:/gi, "")
    .trim()
    .slice(0, 1000);

  if (!sanitized) throw new Error("Message vide");

  const insertData: { order_id: string; sender_type: string; sender_id: string; message: string; target_type?: string } = {
    order_id: orderId,
    sender_type: senderType,
    sender_id: senderId,
    message: sanitized,
  };
  if (targetType) {
    insertData.target_type = targetType;
  } else if (senderType === "restaurant") {
    insertData.target_type = "restaurant";
  } else if (senderType === "driver") {
    insertData.target_type = "driver";
  }
  const { data, error } = await supabase
    .from("chat_messages")
    .insert(insertData)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export function subscribeToChatMessages(
  orderId: string,
  onMessage: (msg: Tables<"chat_messages">) => void
) {
  const channel = supabase
    .channel(`chat:${orderId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "chat_messages",
        filter: `order_id=eq.${orderId}`,
      },
      (payload) => onMessage(payload.new as Tables<"chat_messages">)
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
