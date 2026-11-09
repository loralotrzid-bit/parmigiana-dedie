import { supabase } from "@/integrations/supabase/client";

export async function assignOrderToDriver(orderId: string, driverId: string) {
  const { data, error } = await supabase
    .from("delivery_assignments")
    .insert({ order_id: orderId, driver_id: driverId, status: "assigned" })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateAssignmentStatus(
  assignmentId: string,
  status: string,
  extras?: { picked_up_at?: string; delivered_at?: string }
) {
  const { data, error } = await supabase
    .from("delivery_assignments")
    .update({ status, ...extras })
    .eq("id", assignmentId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function fetchActiveAssignmentForDriver(driverId: string) {
  const { data, error } = await supabase
    .from("delivery_assignments")
    .select("*, orders(*)")
    .eq("driver_id", driverId)
    .in("status", ["assigned", "picked_up", "in_transit"])
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data;
}

export async function fetchAssignmentsByDriver(driverId: string) {
  const { data, error } = await supabase
    .from("delivery_assignments")
    .select("*, orders(*)")
    .eq("driver_id", driverId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}
