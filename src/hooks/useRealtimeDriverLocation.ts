import { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface DriverLocation {
  latitude: number;
  longitude: number;
  heading: number | null;
  speed: number | null;
  updated_at: string;
}

/**
 * Subscribes to realtime driver location updates with polling fallback.
 * Ensures tracking stays alive even if the realtime connection drops.
 */
export function useRealtimeDriverLocation(driverId: string | undefined) {
  const [location, setLocation] = useState<DriverLocation | null>(null);
  const pollIntervalRef = useRef(2000);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isActiveRef = useRef(true);
  const lastUpdatedRef = useRef<string | null>(null);

  const fetchLocation = useCallback(async (id: string) => {
    const { data, error } = await supabase
      .from("driver_locations")
      .select("latitude, longitude, heading, speed, updated_at")
      .eq("driver_id", id)
      .maybeSingle();

    if (error) {
      console.warn("[GPS] Fetch error:", error.message);
      return null;
    }
    return data as DriverLocation | null;
  }, []);

  useEffect(() => {
    if (!driverId) {
      setLocation(null);
      return;
    }

    isActiveRef.current = true;
    pollIntervalRef.current = 2000;
    lastUpdatedRef.current = null;

    console.log("[GPS] Subscribing to driver:", driverId);

    // Initial fetch
    fetchLocation(driverId).then((data) => {
      if (data) {
        console.log("[GPS] Initial location:", data.latitude, data.longitude);
        setLocation(data);
        lastUpdatedRef.current = data.updated_at;
      } else {
        console.log("[GPS] No initial location found for driver:", driverId);
      }
    });

    // Realtime subscription
    const channel = supabase
      .channel(`driver_loc:${driverId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "driver_locations",
          filter: `driver_id=eq.${driverId}`,
        },
        (payload) => {
          if (payload.eventType === "DELETE") {
            setLocation(null);
            return;
          }
          const newLoc = payload.new as DriverLocation;
          console.log("[GPS] Realtime update:", newLoc.latitude, newLoc.longitude);
          setLocation(newLoc);
          lastUpdatedRef.current = newLoc.updated_at;
          // Reset poll interval when realtime works
          pollIntervalRef.current = 2000;
        }
      )
      .subscribe((status) => {
        console.log("[GPS] Realtime subscription status:", status);
      });

    // Polling fallback — catches missed realtime events
    const poll = async () => {
      if (!isActiveRef.current) return;

      const data = await fetchLocation(driverId);
      if (data && data.updated_at !== lastUpdatedRef.current) {
        console.log("[GPS] Poll found new location:", data.latitude, data.longitude);
        setLocation(data);
        lastUpdatedRef.current = data.updated_at;
        pollIntervalRef.current = 2000; // Reset on new data
      } else {
        // Backoff when no changes
        pollIntervalRef.current = Math.min(pollIntervalRef.current * 1.3, 15000);
      }

      if (isActiveRef.current) {
        timeoutRef.current = setTimeout(poll, pollIntervalRef.current);
      }
    };

    timeoutRef.current = setTimeout(poll, pollIntervalRef.current);

    return () => {
      isActiveRef.current = false;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      supabase.removeChannel(channel);
      console.log("[GPS] Unsubscribed from driver:", driverId);
    };
  }, [driverId, fetchLocation]);

  return location;
}
