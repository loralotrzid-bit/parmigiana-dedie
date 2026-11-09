import { supabase } from "@/integrations/supabase/client";

export interface DeliverySettings {
  restaurant_id: string;
  delivery_paused: boolean;
  paused_until: string | null;
}

export async function fetchDeliverySettings(restaurantId: string): Promise<DeliverySettings | null> {
  const { data } = await supabase
    .from("delivery_settings")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  return data as DeliverySettings | null;
}

export async function isDeliveryPaused(restaurantId: string): Promise<boolean> {
  const settings = await fetchDeliverySettings(restaurantId);
  if (!settings || !settings.delivery_paused) return false;
  if (settings.paused_until) {
    return new Date(settings.paused_until) > new Date();
  }
  return true; // manual reactivation
}

export async function toggleDeliveryPause(
  restaurantId: string,
  paused: boolean,
  durationMinutes?: number
): Promise<void> {
  const pausedUntil = paused && durationMinutes
    ? new Date(Date.now() + durationMinutes * 60000).toISOString()
    : null;

  await supabase.from("delivery_settings").upsert(
    {
      restaurant_id: restaurantId,
      delivery_paused: paused,
      paused_until: pausedUntil,
      paused_at: paused ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "restaurant_id" }
  );
}
