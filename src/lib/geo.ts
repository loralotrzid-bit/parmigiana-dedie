import { cached, TTL } from "./cache";

/**
 * Haversine distance in km between two lat/lng points.
 */
export function haversineKm(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg: number) {
  return (deg * Math.PI) / 180;
}

/**
 * Calculate delivery fee based on restaurant config.
 */
export function calcDeliveryFee(
  distanceKm: number,
  mode: string,
  flatFee: number,
  freeUnderKm: number | null,
  perKmFee: number
): number | null {
  if (mode === "disabled") return null;
  if (mode === "free") return 0;
  if (mode === "flat") return flatFee;
  if (freeUnderKm && distanceKm <= freeUnderKm) return 0;
  return Math.round(distanceKm * perKmFee * 100) / 100;
}

export interface GeoResult {
  display_name: string;
  lat: number;
  lng: number;
  street?: string;
  house_number?: string;
  postcode?: string;
  city?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

// Cache user's approximate location for search bias
let _userBias: { lat: number; lng: number } | null = null;

/**
 * Try to get user's current position for search biasing.
 * Called once lazily; result is cached.
 */
function getUserBias(): { lat: number; lng: number } {
  if (_userBias) return _userBias;
  // Default: Belgium center
  return { lat: 50.5, lng: 4.35 };
}

/** Allow external code to set the user bias (e.g. after geolocation). */
export function setSearchBias(lat: number, lng: number) {
  _userBias = { lat, lng };
}

/**
 * Normalize query: swap "33 Rue X" → "Rue X 33" for better Photon results.
 */
function normalizeQuery(q: string): string {
  // Match leading house number like "33 Rue de la Neuville"
  const match = q.match(/^(\d+\w*)\s+(.+)$/);
  if (match) {
    return `${match[2]} ${match[1]}`;
  }
  return q;
}

/**
 * Search addresses using Photon (Komoot) — fast, OSM-based, no API key.
 * Prioritizes results near user's location. Belgium results sorted first
 * but not hard-filtered, so the app can scale internationally.
 */
export async function searchAddress(
  query: string,
  signal?: AbortSignal
): Promise<GeoResult[]> {
  if (query.trim().length < 3) return [];

  const bias = getUserBias();
  const normalized = normalizeQuery(query.trim());
  const cacheKey = `geo:search:${normalized}:${bias.lat.toFixed(1)}:${bias.lng.toFixed(1)}`;

  // Check cache first (no signal needed for cache hits)
  const cachedResult = await cached<GeoResult[]>(cacheKey, TTL.GEO_SEARCH, async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    try {
      const params = new URLSearchParams({
        q: normalized,
        limit: "8",
        lang: "fr",
        lat: String(bias.lat),
        lon: String(bias.lng),
      });

      const res = await fetch(
        `https://photon.komoot.io/api/?${params}`,
        { signal: signal || controller.signal }
      );
      clearTimeout(timeout);

      if (!res.ok) return [];
      const data: unknown = await res.json();

      if (!isRecord(data) || !Array.isArray(data.features)) return [];

      const mapped = data.features
        .flatMap((feature): (GeoResult & { _country: string })[] => {
          if (!isRecord(feature)) return [];
          const properties = isRecord(feature.properties) ? feature.properties : {};
          const geometry = isRecord(feature.geometry) ? feature.geometry : {};
          const coordinates = geometry.coordinates;
          if (!Array.isArray(coordinates) || typeof coordinates[0] !== "number" || typeof coordinates[1] !== "number") return [];
          const street = stringValue(properties.street) || stringValue(properties.name);
          const houseNumber = stringValue(properties.housenumber);
          const postcode = stringValue(properties.postcode);
          const city = stringValue(properties.city) || stringValue(properties.town) || stringValue(properties.village) || stringValue(properties.locality);
          const country = stringValue(properties.country);

          const streetPart = houseNumber ? `${street} ${houseNumber}` : street;
          const cityPart = postcode && city ? `${postcode} ${city}` : city;
          const displayParts = [streetPart, cityPart].filter(Boolean);

          return [{
            display_name: displayParts.length > 0 ? displayParts.join(", ") : stringValue(properties.name) || "Adresse",
            lat: coordinates[1],
            lng: coordinates[0],
            street,
            house_number: houseNumber,
            postcode,
            city,
            _country: country,
          }];
        });

      const belgiumNames = ["Belgique", "Belgium", "België"];
      mapped.sort((a, b) => {
        const aIsBE = belgiumNames.includes(a._country) ? 0 : 1;
        const bIsBE = belgiumNames.includes(b._country) ? 0 : 1;
        if (aIsBE !== bIsBE) return aIsBE - bIsBE;
        const distA = Math.abs(a.lat - bias.lat) + Math.abs(a.lng - bias.lng);
        const distB = Math.abs(b.lat - bias.lat) + Math.abs(b.lng - bias.lng);
        return distA - distB;
      });

      return mapped.slice(0, 5).map(({ _country: _ignoredCountry, ...rest }) => rest);
    } catch {
      clearTimeout(timeout);
      return [];
    }
  });

  return cachedResult;
}

/**
 * Reverse-geocode lat/lng → address via Photon reverse.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<GeoResult | null> {
  const cacheKey = `geo:reverse:${lat.toFixed(5)}:${lng.toFixed(5)}`;
  return cached(cacheKey, TTL.GEO_REVERSE, async () => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);

      const res = await fetch(
        `https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}&lang=fr`,
        { signal: controller.signal }
      );
      clearTimeout(timeout);

      if (!res.ok) return null;
      const data = await res.json();
      const f = data.features?.[0];
      if (!f) return null;

      const p = f.properties || {};
      const street = p.street || p.name || "";
      const houseNumber = p.housenumber || "";
      const postcode = p.postcode || "";
      const city = p.city || p.town || p.village || p.locality || "";
      const streetPart = houseNumber ? `${street} ${houseNumber}` : street;
      const cityPart = postcode && city ? `${postcode} ${city}` : city;
      const displayParts = [streetPart, cityPart].filter(Boolean);

      return {
        display_name: displayParts.length > 0 ? displayParts.join(", ") : p.name || "Adresse",
        lat, lng,
        street,
        house_number: houseNumber,
        postcode,
        city,
      };
    } catch {
      return null;
    }
  });
}

/**
 * Forward-geocode a structured address to get lat/lng (for manual edits).
 */
export async function geocodeAddress(
  street: string, number: string, postcode: string, city: string
): Promise<GeoResult | null> {
  const query = [number ? `${street} ${number}` : street, `${postcode} ${city}`].filter(Boolean).join(", ");
  if (query.length < 5) return null;
  const results = await searchAddress(query);
  return results[0] || null;
}
