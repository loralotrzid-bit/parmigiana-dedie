import { useEffect, useRef, useCallback } from "react";
import { updateDriverLocation } from "@/services/deliveryApiService";
import { safeToast } from "@/lib/safeToast";
import {
  checkGeoPermission,
  startWatchPosition,
  stopWatchPosition,
  isAccurateEnough,
  pickBestPosition,
  MAX_ACCURACY_METERS,
  WARMUP_SAMPLE_COUNT,
  WARMUP_DURATION_MS,
} from "@/lib/geolocation";

const FALLBACK_INTERVAL = 10000;
const STALE_THRESHOLD = 20000;
const TAG = "[DriverGPS]";

/** Max plausible jump in meters between two consecutive updates (prevents WiFi/cell tower teleports) */
const MAX_JUMP_METERS = 2000;

/** Haversine distance in meters between two lat/lng points */
function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Driver GPS hook with accuracy filtering and warm-up stabilisation.
 *
 * IMPORTANT: The first activation of GPS tracking should be initiated from a user gesture
 * (e.g. clicking "Start delivery"). The `active` flag should only become true after such a gesture.
 * This ensures Safari/iOS will show the permission prompt correctly.
 */
export function useDriverGps(driverId: string | undefined, active: boolean) {
  const watchRef = useRef<number | null>(null);
  const fallbackRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSentRef = useRef<number>(0);
  const staleCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const activeRef = useRef(active);
  activeRef.current = active;
  const driverIdRef = useRef(driverId);
  driverIdRef.current = driverId;
  const permissionCheckedRef = useRef(false);

  // Warm-up state: collect initial positions, pick the best one
  const warmupRef = useRef<{
    active: boolean;
    samples: GeolocationPosition[];
    timer: ReturnType<typeof setTimeout> | null;
  }>({ active: false, samples: [], timer: null });

  const lastPositionRef = useRef<{ lat: number; lng: number; time: number } | null>(null);

  const upsertPosition = useCallback((pos: GeolocationPosition) => {
    const id = driverIdRef.current;
    if (!id) return;

    const { latitude, longitude } = pos.coords;

    // Jump detection: reject sudden teleports (e.g. WiFi/cell tower switch)
    const last = lastPositionRef.current;
    if (last) {
      const dist = haversineM(last.lat, last.lng, latitude, longitude);
      const elapsed = (Date.now() - last.time) / 1000; // seconds
      if (dist > MAX_JUMP_METERS && elapsed < 60) {
        console.warn(
          `${TAG} Rejected jump: ${dist.toFixed(0)}m in ${elapsed.toFixed(0)}s (max ${MAX_JUMP_METERS}m)`
        );
        return;
      }
    }

    lastPositionRef.current = { lat: latitude, lng: longitude, time: Date.now() };
    lastSentRef.current = Date.now();

    void updateDriverLocation({ latitude, longitude, heading: pos.coords.heading, speed: pos.coords.speed, accuracy: pos.coords.accuracy })
      .catch((error) => console.error(`${TAG} Location update error:`, error instanceof Error ? error.message : "unknown"));
  }, []);

  /** End warm-up: pick best position and send it */
  const endWarmup = useCallback(() => {
    const wu = warmupRef.current;
    if (!wu.active) return;
    wu.active = false;
    if (wu.timer) { clearTimeout(wu.timer); wu.timer = null; }

    const best = pickBestPosition(wu.samples);
    if (best) {
      upsertPosition(best);
    }
    wu.samples = [];
  }, [upsertPosition]);

  /**
   * Process incoming position: during warm-up collect samples,
   * after warm-up filter by accuracy before sending.
   */
  const handlePosition = useCallback((pos: GeolocationPosition) => {
    const wu = warmupRef.current;

    if (wu.active) {
      // Warm-up phase — collect samples
      wu.samples.push(pos);
      if (wu.samples.length >= WARMUP_SAMPLE_COUNT) {
        endWarmup();
      }
      return;
    }

    // Normal phase — filter by accuracy
    if (!isAccurateEnough(pos)) {
      return;
    }

    upsertPosition(pos);
  }, [upsertPosition, endWarmup]);

  const stopWatch = useCallback(() => {
    stopWatchPosition(watchRef.current);
    watchRef.current = null;
  }, []);

  const doStartWatch = useCallback((withWarmup = false) => {
    stopWatch();
    if (!navigator.geolocation) return;

    // Start warm-up phase if requested
    if (withWarmup) {
      const wu = warmupRef.current;
      wu.active = true;
      wu.samples = [];
      if (wu.timer) clearTimeout(wu.timer);
      wu.timer = setTimeout(() => {
        
        endWarmup();
      }, WARMUP_DURATION_MS);
      
    }

    
    watchRef.current = startWatchPosition(
      handlePosition,
      (err) => {
        
        if (err.code === err.PERMISSION_DENIED) {
          safeToast.error("Accès GPS refusé. Activez la géolocalisation dans les paramètres.");
        }
      }
    );
  }, [handlePosition, stopWatch, endWarmup]);

  // Fallback polling with accuracy filter
  const startFallback = useCallback(() => {
    if (fallbackRef.current) clearInterval(fallbackRef.current);
    fallbackRef.current = setInterval(() => {
      if (!driverIdRef.current || !activeRef.current) return;
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (isAccurateEnough(pos)) {
            upsertPosition(pos);
          }
        },
        () => { /* Location may be temporarily unavailable; stale-check retries. */ },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
      );
    }, FALLBACK_INTERVAL);
  }, [upsertPosition]);

  // Stale detection
  const startStaleCheck = useCallback(() => {
    if (staleCheckRef.current) clearInterval(staleCheckRef.current);
    staleCheckRef.current = setInterval(() => {
      if (!activeRef.current) return;
      if (Date.now() - lastSentRef.current > STALE_THRESHOLD) {
        
        doStartWatch(false);
      }
    }, STALE_THRESHOLD);
  }, [doStartWatch]);

  // Wake Lock
  const requestWakeLock = useCallback(async () => {
    try {
      if ("wakeLock" in navigator) {
        wakeLockRef.current = await navigator.wakeLock.request("screen");
      }
    } catch {
      // Wake Lock can be denied or unsupported; GPS tracking continues in the foreground.
    }
  }, []);

  const releaseWakeLock = useCallback(() => {
    wakeLockRef.current?.release().catch(() => {});
    wakeLockRef.current = null;
  }, []);

  // Visibility change — restart GPS when page becomes visible
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible" && activeRef.current && driverIdRef.current) {
        
        doStartWatch(true); // Use warm-up after page regains visibility
        requestWakeLock();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [doStartWatch, requestWakeLock]);

  // Main effect — runs when active/driverId changes
  useEffect(() => {
    const warmup = warmupRef.current;
    if (!driverId || !active) {
      stopWatch();
      if (fallbackRef.current) { clearInterval(fallbackRef.current); fallbackRef.current = null; }
      if (staleCheckRef.current) { clearInterval(staleCheckRef.current); staleCheckRef.current = null; }
      // Cancel any pending warm-up
      if (warmup.timer) { clearTimeout(warmup.timer); warmup.timer = null; }
      warmup.active = false;
      warmup.samples = [];
      releaseWakeLock();
      return;
    }

    if (!navigator.geolocation) {
      safeToast.error("Votre navigateur ne supporte pas la géolocalisation.");
      return;
    }

    const init = async () => {
      const permState = await checkGeoPermission();
      

      if (permState === "denied") {
        safeToast.error("Accès GPS refusé. Activez la géolocalisation dans les paramètres de votre navigateur.");
        return;
      }

      permissionCheckedRef.current = true;
      doStartWatch(true); // Start with warm-up for better initial accuracy
      startFallback();
      startStaleCheck();
      requestWakeLock();
    };

    init();

    return () => {
      stopWatch();
      if (fallbackRef.current) { clearInterval(fallbackRef.current); fallbackRef.current = null; }
      if (staleCheckRef.current) { clearInterval(staleCheckRef.current); staleCheckRef.current = null; }
      if (warmup.timer) { clearTimeout(warmup.timer); warmup.timer = null; }
      warmup.active = false;
      warmup.samples = [];
      releaseWakeLock();
    };
  }, [driverId, active, doStartWatch, startFallback, startStaleCheck, requestWakeLock, releaseWakeLock, stopWatch]);
}

