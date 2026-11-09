/**
 * Restaurant data fetching — REST-first, localStorage persistence.
 *
 * Strategy (Uber Eats pattern):
 * 1. Try REST API (public_restaurants view) — fastest, no auth lock
 * 2. Fallback REST → restaurants table (is_visible filter)
 * 3. Offline fallback → localStorage persisted data
 *
 * ✅ No Supabase JS client — eliminates Navigator LockManager timeouts
 * ✅ AbortController with 6s timeout — prevents UI freeze
 * ✅ localStorage persistence — instant first render via React Query initialData
 */

import type { Tables } from "@/integrations/supabase/types";
import { restQuery, withTimeout } from "@/lib/restClient";
import { persistGet, persistSet } from "@/lib/persistCache";

type Restaurant = Tables<"restaurants">;

const TAG = "[restaurantService]";

// Only columns needed by Home.tsx feed — minimizes payload
const FEED_COLUMNS = "id,name,slug,description,image_url,logo_url,is_open,halal_type,rating,avg_prep_time,avg_delivery_time,dine_in_enabled,address,cuisine_type,cuisine_categories,minimum_order,is_free_delivery,is_top_rated,delivery_mode,scheduling_mode,opening_hours" as const;

// ── Fetch restaurant list ───────────────────────────────────────────

export async function fetchRestaurants(): Promise<Partial<Restaurant>[]> {
  const { ac, cleanup } = withTimeout(6000);

  try {
    // 1. REST → public_restaurants view (fastest, pre-filtered)
    try {
      const data = await restQuery<Partial<Restaurant>>(
        TAG, "public_restaurants",
        { select: FEED_COLUMNS, slug: "eq.la-parmigiana", order: "rating.desc.nullslast", limit: "50" },
        ac.signal,
      );
      if (data.length > 0) {
        persistSet("restaurants", data);
        return data;
      }
    } catch (e) {
      console.warn(`${TAG} REST public_restaurants failed`, e);
    }

    // 2. REST → restaurants table with is_visible filter
    try {
      const data = await restQuery<Partial<Restaurant>>(
        TAG, "restaurants",
        { select: FEED_COLUMNS, slug: "eq.la-parmigiana", is_visible: "eq.true", order: "rating.desc.nullslast", limit: "50" },
        ac.signal,
      );
      if (data.length > 0) {
        console.warn(`${TAG} used visible restaurants REST fallback`);
        persistSet("restaurants", data);
        return data;
      }
    } catch (e) {
      console.warn(`${TAG} REST restaurants fallback failed`, e);
    }

    // 3. Offline fallback — localStorage
    const persisted = persistGet<Partial<Restaurant>[]>("restaurants");
    if (persisted && persisted.length > 0) {
      console.log(`${TAG} returning persisted restaurants (${persisted.length})`);
      return persisted.filter((restaurant) => restaurant.slug === "la-parmigiana");
    }

    return [];
  } finally {
    cleanup();
  }
}

// ── Fetch single restaurant by slug ─────────────────────────────────

export async function fetchRestaurantBySlug(slug: string): Promise<Restaurant> {
  if (slug !== "la-parmigiana") throw new Error("Restaurant non disponible dans cette application");
  const { ac, cleanup } = withTimeout(6000);
  const encoded = encodeURIComponent(slug);
  const cacheKey = `restaurant:${slug}`;

  try {
    // 1. REST → public_restaurants
    try {
      const rows = await restQuery<Partial<Restaurant>>(
        TAG, "public_restaurants",
        { select: "*", slug: `eq.${encoded}`, limit: "1" },
        ac.signal,
      );
      if (rows[0]) {
        persistSet(cacheKey, rows[0]);
        return rows[0] as Restaurant;
      }
    } catch (e) {
      console.warn(`${TAG} REST slug lookup failed`, e);
    }

    // 2. REST → restaurants (visible)
    try {
      const rows = await restQuery<Partial<Restaurant>>(
        TAG, "restaurants",
        { select: "*", slug: `eq.${encoded}`, is_visible: "eq.true", limit: "1" },
        ac.signal,
      );
      if (rows[0]) {
        persistSet(cacheKey, rows[0]);
        return rows[0] as Restaurant;
      }
    } catch (e) {
      console.warn(`${TAG} REST visible slug lookup failed`, e);
    }

    // 3. Offline fallback — localStorage
    const persisted = persistGet<Restaurant>(cacheKey);
    if (persisted) {
      console.log(`${TAG} returning persisted restaurant for ${slug}`);
      return persisted;
    }

    throw new Error("Restaurant introuvable");
  } finally {
    cleanup();
  }
}
