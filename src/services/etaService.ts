import { supabase } from "@/integrations/supabase/client";
import { haversineKm } from "@/lib/geo";

/**
 * Calculate smart ETA for a restaurant order.
 * Formula: queue_time + prep_time + travel_time + correction_margin
 */
export async function calculateEta(
  restaurantId: string,
  clientLat?: number | null,
  clientLng?: number | null
): Promise<{ eta_minutes: number; confidence: "low" | "medium" | "high" }> {
  // 1. Get restaurant info
  const { data: resto } = await supabase
    .from("restaurants")
    .select("avg_prep_time, latitude, longitude")
    .eq("id", restaurantId)
    .single();

  const basePrepTime = resto?.avg_prep_time ?? 20;

  // 2. Count orders in queue (pending + preparing)
  const { count } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("restaurant_id", restaurantId)
    .in("status", ["pending", "preparing"]);

  const queueTime = (count ?? 0) * 5; // ~5 min per order in queue

  // 3. Travel time (rough: 30 km/h average city speed)
  let travelTime = 0;
  const restoLat = resto?.latitude;
  const restoLng = resto?.longitude;
  if (clientLat && clientLng && restoLat && restoLng) {
    const distKm = haversineKm(restoLat, restoLng, clientLat, clientLng);
    travelTime = Math.ceil((distKm / 30) * 60); // minutes
  }

  // 4. Correction margin from eta_learning
  let correction = 0;
  const { data: learning } = await supabase
    .from("eta_learning")
    .select("correction_margin, total_orders")
    .eq("restaurant_id", restaurantId)
    .order("week_start", { ascending: false })
    .limit(1);

  if (learning && learning.length > 0) {
    correction = Number(learning[0].correction_margin) || 0;
  }

  const totalEta = Math.max(5, basePrepTime + queueTime + travelTime + correction);

  // Confidence based on data availability
  let confidence: "low" | "medium" | "high" = "medium";
  if (learning && learning.length > 0 && learning[0].total_orders > 10) {
    confidence = "high";
  } else if (!restoLat || !restoLng) {
    confidence = "low";
  }

  return { eta_minutes: Math.round(totalEta), confidence };
}
