/**
 * Shared geolocation utility — Safari/iOS compatible.
 *
 * Key rules:
 *  1. getCurrentPosition / watchPosition MUST be called directly from a user gesture (click handler).
 *  2. Never call them inside useEffect or after an unrelated async operation.
 *  3. Check permission state before showing errors.
 */

const TAG = "[Geolocation]";

/** Maximum acceptable accuracy in meters — positions worse than this are discarded */
export const MAX_ACCURACY_METERS = 80;

/** Number of positions to collect during warm-up before sending the best one */
export const WARMUP_SAMPLE_COUNT = 3;

/** Duration of warm-up phase in ms */
export const WARMUP_DURATION_MS = 6000;

export type GeoPermissionState = "granted" | "denied" | "prompt" | "unknown";

/**
 * Check the current geolocation permission state without triggering the prompt.
 * Falls back to "unknown" on browsers that don't support the Permissions API.
 */
export async function checkGeoPermission(): Promise<GeoPermissionState> {
  try {
    if ("permissions" in navigator) {
      const status = await navigator.permissions.query({ name: "geolocation" as PermissionName });
      console.log(`${TAG} Permission state: ${status.state}`);
      return status.state as GeoPermissionState;
    }
  } catch (e) {
    console.warn(`${TAG} Permissions API not available:`, e);
  }
  return "unknown";
}

/**
 * Returns true if the position meets our accuracy threshold.
 */
export function isAccurateEnough(pos: GeolocationPosition, maxAccuracy = MAX_ACCURACY_METERS): boolean {
  return pos.coords.accuracy <= maxAccuracy;
}

/**
 * Pick the most accurate position from a list.
 */
export function pickBestPosition(positions: GeolocationPosition[]): GeolocationPosition | null {
  if (positions.length === 0) return null;
  return positions.reduce((best, pos) =>
    pos.coords.accuracy < best.coords.accuracy ? pos : best
  );
}

/**
 * Request the user's current position. MUST be called directly from a click handler.
 * Returns the position or null (never throws).
 */
export function requestCurrentPosition(
  options?: PositionOptions
): Promise<GeolocationPosition | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      console.error(`${TAG} Geolocation API not supported`);
      resolve(null);
      return;
    }

    const opts: PositionOptions = {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0,
      ...options,
    };

    console.log(`${TAG} Calling getCurrentPosition (direct from user gesture)`);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        console.log(`${TAG} getCurrentPosition success:`, pos.coords.latitude.toFixed(5), pos.coords.longitude.toFixed(5), `accuracy=${pos.coords.accuracy}m`);
        resolve(pos);
      },
      (err) => {
        console.warn(`${TAG} getCurrentPosition error: code=${err.code} message=${err.message}`);
        resolve(null);
      },
      opts
    );
  });
}

export interface GeoError {
  type: "unsupported" | "denied" | "unavailable" | "timeout";
  message: string;
}

/**
 * Request position with structured error info. MUST be called directly from click handler.
 */
export function requestCurrentPositionWithError(
  options?: PositionOptions
): Promise<{ position: GeolocationPosition | null; error: GeoError | null }> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({
        position: null,
        error: { type: "unsupported", message: "Votre navigateur ne supporte pas la géolocalisation." },
      });
      return;
    }

    const opts: PositionOptions = {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0,
      ...options,
    };

    console.log(`${TAG} Calling getCurrentPosition (with error details)`);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        console.log(`${TAG} Success:`, pos.coords.latitude.toFixed(5), pos.coords.longitude.toFixed(5), `accuracy=${pos.coords.accuracy}m`);
        resolve({ position: pos, error: null });
      },
      (err) => {
        console.warn(`${TAG} Error: code=${err.code} message=${err.message}`);
        let geoError: GeoError;
        switch (err.code) {
          case err.PERMISSION_DENIED:
            geoError = {
              type: "denied",
              message: "Accès à la position refusé. Autorisez la géolocalisation dans les paramètres de votre navigateur.",
            };
            break;
          case err.POSITION_UNAVAILABLE:
            geoError = {
              type: "unavailable",
              message: "Position indisponible. Vérifiez que la localisation est activée sur votre appareil.",
            };
            break;
          case err.TIMEOUT:
            geoError = {
              type: "timeout",
              message: "Délai dépassé. Vérifiez votre connexion et réessayez.",
            };
            break;
          default:
            geoError = {
              type: "unavailable",
              message: "Impossible d'obtenir votre position.",
            };
        }
        resolve({ position: null, error: geoError });
      },
      opts
    );
  });
}

/**
 * High-accuracy GPS options — maximumAge: 0 forces fresh readings.
 */
const HIGH_ACCURACY_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 0,
  timeout: 20000,
};

/**
 * Start watchPosition. MUST be initiated from a user gesture for the first call.
 * Returns the watch ID for cleanup.
 */
export function startWatchPosition(
  onPosition: (pos: GeolocationPosition) => void,
  onError?: (err: GeolocationPositionError) => void,
  options?: PositionOptions
): number | null {
  if (!navigator.geolocation) {
    console.error(`${TAG} Geolocation API not supported`);
    return null;
  }

  const opts: PositionOptions = {
    ...HIGH_ACCURACY_OPTIONS,
    ...options,
  };

  console.log(`${TAG} Starting watchPosition (highAccuracy, maximumAge=0)`);

  return navigator.geolocation.watchPosition(
    (pos) => {
      console.log(
        `${TAG} Watch update: ${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)} accuracy=${pos.coords.accuracy.toFixed(0)}m`
      );
      onPosition(pos);
    },
    (err) => {
      console.warn(`${TAG} Watch error: code=${err.code} message=${err.message}`);
      onError?.(err);
    },
    opts
  );
}

export function stopWatchPosition(watchId: number | null) {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    console.log(`${TAG} Cleared watch ID ${watchId}`);
  }
}
