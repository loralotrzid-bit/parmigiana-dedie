import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { cached, TTL } from "@/lib/cache";
import { restQuery, withTimeout } from "@/lib/restClient";
import { persistGet, persistSet } from "@/lib/persistCache";
import { logger } from "@/lib/logger";
import type { OpeningHours } from "@/lib/openingHours";

export interface RestaurantConfig {
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  delivery_mode: string;
  is_free_delivery: boolean;
  dine_in_enabled: boolean;
  delivery_flat_fee: number;
  delivery_free_under_km: number | null;
  delivery_per_km_fee: number;
  max_delivery_radius_km: number;
  opening_hours: OpeningHours;
  description: string | null;
  cuisine_type: string | null;
  cuisine_categories: string[];
  halal_type: string;
  avg_prep_time: number | null;
  avg_delivery_time: number | null;
  image_url: string | null;
  logo_url: string | null;
  accepted_payments: string[];
  default_driver_id: string | null;
  scheduling_mode: string;
}

const TAG = "[restaurantConfig]";

// Public config (no sensitive fields) — used by client-facing pages
const PUBLIC_CONFIG_COLUMNS = "latitude,longitude,address,delivery_mode,is_free_delivery,dine_in_enabled,delivery_flat_fee,delivery_free_under_km,delivery_per_km_fee,max_delivery_radius_km,opening_hours,description,cuisine_type,cuisine_categories,halal_type,avg_prep_time,avg_delivery_time,image_url,logo_url,accepted_payments,scheduling_mode" as const;

export async function fetchRestaurantConfig(restaurantId: string): Promise<RestaurantConfig> {
  const cacheKey = `restaurant:config:${restaurantId}`;

  return cached(cacheKey, TTL.RESTAURANT_CONFIG, async () => {
    const { ac, cleanup } = withTimeout(5000);

    try {
      // 1) REST-first (bypasses SDK lock contention)
      try {
        const rows = await restQuery<Partial<RestaurantConfig>>(
          TAG,
          "public_restaurants",
          { select: PUBLIC_CONFIG_COLUMNS, id: `eq.${restaurantId}`, limit: "1" },
          ac.signal,
        );

        if (rows[0]) {
          const config = { ...(rows[0] as object), default_driver_id: null } as RestaurantConfig;
          persistSet(cacheKey, config);
          return config;
        }
      } catch (e) {
        logger.debug(`${TAG} REST failed, fallback to SDK`, e);
      }

      // 2) SDK fallback
      const { data, error } = await (supabase
        .from("public_restaurants")
        .select(PUBLIC_CONFIG_COLUMNS)
        .eq("id", restaurantId)
        .single());

      if (error) throw error;

      const config = { ...(data as object), default_driver_id: null } as RestaurantConfig;
      persistSet(cacheKey, config);
      return config;
    } catch (error) {
      // 3) Offline/persisted fallback
      const persisted = persistGet<RestaurantConfig>(cacheKey);
      if (persisted) {
        logger.warn(`${TAG} using persisted config fallback for ${restaurantId}`);
        return persisted;
      }
      throw error;
    } finally {
      cleanup();
    }
  });
}

// Admin config — includes sensitive fields, reads from base table (admin RLS applies)
export async function fetchAdminRestaurantConfig(restaurantId: string): Promise<RestaurantConfig> {
  return cached(`restaurant:admin-config:${restaurantId}`, TTL.RESTAURANT_CONFIG, async () => {
    const { data, error } = await supabase
      .from("restaurants")
      .select("latitude, longitude, address, delivery_mode, is_free_delivery, dine_in_enabled, delivery_flat_fee, delivery_free_under_km, delivery_per_km_fee, max_delivery_radius_km, opening_hours, description, cuisine_type, cuisine_categories, halal_type, avg_prep_time, avg_delivery_time, image_url, logo_url, accepted_payments, default_driver_id, scheduling_mode")
      .eq("id", restaurantId)
      .single();
    if (error) throw error;
    return data as unknown as RestaurantConfig;
  });
}

export async function updateRestaurantConfig(restaurantId: string, config: Partial<RestaurantConfig>) {
  const { error } = await supabase
    .from("restaurants")
    .update({ ...config, opening_hours: config.opening_hours as unknown as Json })
    .eq("id", restaurantId);
  if (error) {
    console.error("[RestaurantConfig] Save error");
    throw error;
  }
  const { invalidateCache } = await import("@/lib/cache");
  invalidateCache(`restaurant:config:${restaurantId}`);
  invalidateCache(`restaurant:admin-config:${restaurantId}`);
  invalidateCache("restaurants:all");
  invalidateCache("restaurant:slug:");
}
