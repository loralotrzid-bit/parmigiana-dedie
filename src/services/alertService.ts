import { supabase } from "@/integrations/supabase/client";

export async function fetchAlerts(onlyUnread = false) {
  let query = supabase
    .from("admin_alerts")
    .select("*, restaurants(name)")
    .order("created_at", { ascending: false });

  if (onlyUnread) {
    query = query.eq("is_read", false);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function markAlertRead(alertId: string) {
  const { error } = await supabase
    .from("admin_alerts")
    .update({ is_read: true })
    .eq("id", alertId);
  if (error) throw error;
}

export async function markAllAlertsRead() {
  const { error } = await supabase
    .from("admin_alerts")
    .update({ is_read: true })
    .eq("is_read", false);
  if (error) throw error;
}

export async function fetchUnreadAlertCount() {
  const { count, error } = await supabase
    .from("admin_alerts")
    .select("id", { count: "exact", head: true })
    .eq("is_read", false);
  if (error) throw error;
  return count ?? 0;
}
