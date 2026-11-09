import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

export async function fetchAuditLogs(restaurantId?: string) {
  let query = supabase
    .from("audit_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  if (restaurantId) {
    query = query.eq("restaurant_id", restaurantId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function insertAuditLog(
  restaurantId: string,
  userId: string,
  action: string,
  details: Json
) {
  const { error } = await supabase
    .from("audit_log")
    .insert({ restaurant_id: restaurantId, user_id: userId, action, details });
  if (error) throw error;
}
