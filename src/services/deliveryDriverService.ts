import { supabase } from "@/integrations/supabase/client";

export async function fetchDriversByRestaurant(restaurantId: string) {
  const { data, error } = await supabase
    .from("delivery_drivers")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function createDriver(
  restaurantId: string,
  data: { driver_code: string; full_name: string; phone?: string; can_deliver?: boolean; can_serve?: boolean }
) {
  const { data: driver, error } = await supabase
    .from("delivery_drivers")
    .insert({ restaurant_id: restaurantId, ...data })
    .select()
    .single();
  if (error) throw error;
  return driver;
}

export async function updateDriver(
  driverId: string,
  updates: {
    driver_code?: string;
    full_name?: string;
    phone?: string;
    is_active?: boolean;
    internal_rating?: number | null;
    can_deliver?: boolean;
    can_serve?: boolean;
  }
) {
  const { data, error } = await supabase
    .from("delivery_drivers")
    .update(updates)
    .eq("id", driverId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteDriver(driverId: string) {
  const { error } = await supabase
    .from("delivery_drivers")
    .delete()
    .eq("id", driverId);
  if (error) throw error;
}

export async function fetchDriverStats(driverId: string) {
  const { data, error } = await supabase
    .from("delivery_assignments")
    .select("id, status, created_at, delivered_at")
    .eq("driver_id", driverId);
  if (error) throw error;

  const total = data.length;
  const delivered = data.filter((a) => a.status === "delivered").length;
  return { total, delivered };
}
