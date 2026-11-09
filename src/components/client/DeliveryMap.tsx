import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";

// Fix default marker icons
delete (L.Icon.Default.prototype as L.Icon.Default & { _getIconUrl?: () => string })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

const createEmojiIcon = (emoji: string, size: number = 36) =>
  L.divIcon({
    html: `<span style="font-size:${size}px;line-height:1;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.3))">${emoji}</span>`,
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });

const driverIcon = createEmojiIcon("🛵", 38);
const restaurantIcon = createEmojiIcon("🏪", 32);
const clientIcon = createEmojiIcon("🏠", 32);

/** Fetch real road route from OSRM (free, no key) */
async function fetchRoute(points: [number, number][], signal?: AbortSignal): Promise<[number, number][]> {
  if (points.length < 2) return [];
  const coords = points.map(([lat, lng]) => `${lng},${lat}`).join(";");

  try {
    const res = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`,
      { signal }
    );
    const json = await res.json();
    if (json.code === "Ok" && json.routes?.[0]) {
      return json.routes[0].geometry.coordinates.map(([lng, lat]: number[]) => [lat, lng] as [number, number]);
    }
  } catch (e) {
    if (!signal?.aborted) {
      console.warn("[Map] OSRM routing failed, hiding route line", e);
    }
  }

  return [];
}

interface DeliveryMapProps {
  driverLat: number;
  driverLng: number;
  restaurantLat?: number;
  restaurantLng?: number;
  clientLat?: number;
  clientLng?: number;
}

const DeliveryMap = ({
  driverLat,
  driverLng,
  restaurantLat,
  restaurantLng,
  clientLat,
  clientLng,
}: DeliveryMapProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const driverMarkerRef = useRef<L.Marker | null>(null);
  const restaurantMarkerRef = useRef<L.Marker | null>(null);
  const clientMarkerRef = useRef<L.Marker | null>(null);
  const polylineRef = useRef<L.Polyline | null>(null);
  const routingAbortRef = useRef<AbortController | null>(null);
  const initialCenterRef = useRef<[number, number]>([driverLat, driverLng]);
  const hasRestaurant = restaurantLat != null && restaurantLng != null;
  const hasClient = clientLat != null && clientLng != null;

  // Initialize map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: initialCenterRef.current,
      zoom: 14,
      scrollWheelZoom: false,
      zoomControl: false,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://osm.org/copyright">OSM</a>',
    }).addTo(map);

    mapRef.current = map;

    return () => {
      routingAbortRef.current?.abort();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update markers and polyline
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Driver marker
    if (driverMarkerRef.current) {
      driverMarkerRef.current.setLatLng([driverLat, driverLng]);
    } else {
      driverMarkerRef.current = L.marker([driverLat, driverLng], { icon: driverIcon })
        .bindPopup("🛵 Votre livreur")
        .addTo(map);
    }

    // Restaurant marker
    if (hasRestaurant) {
      if (restaurantMarkerRef.current) {
        restaurantMarkerRef.current.setLatLng([restaurantLat, restaurantLng]);
      } else {
        restaurantMarkerRef.current = L.marker([restaurantLat, restaurantLng], { icon: restaurantIcon })
          .bindPopup("🏪 Restaurant")
          .addTo(map);
      }
    } else if (restaurantMarkerRef.current) {
      map.removeLayer(restaurantMarkerRef.current);
      restaurantMarkerRef.current = null;
    }

    // Client marker
    if (hasClient) {
      if (clientMarkerRef.current) {
        clientMarkerRef.current.setLatLng([clientLat, clientLng]);
      } else {
        clientMarkerRef.current = L.marker([clientLat, clientLng], { icon: clientIcon })
          .bindPopup("🏠 Votre adresse")
          .addTo(map);
      }
    } else if (clientMarkerRef.current) {
      map.removeLayer(clientMarkerRef.current);
      clientMarkerRef.current = null;
    }

    // Route: restaurant → driver → client (real road via OSRM)
    const waypoints: [number, number][] = [];
    if (hasRestaurant) waypoints.push([restaurantLat, restaurantLng]);
    waypoints.push([driverLat, driverLng]);
    if (hasClient) waypoints.push([clientLat, clientLng]);

    if (waypoints.length >= 2) {
      // Abort previous routing request
      routingAbortRef.current?.abort();
      const ctrl = new AbortController();
      routingAbortRef.current = ctrl;

      fetchRoute(waypoints, ctrl.signal).then((roadPoints) => {
        if (ctrl.signal.aborted) return;
        const map = mapRef.current;
        if (!map) return;

        if (roadPoints.length < 2) {
          if (polylineRef.current) {
            map.removeLayer(polylineRef.current);
            polylineRef.current = null;
          }
          return;
        }

        if (polylineRef.current) {
          polylineRef.current.setLatLngs(roadPoints);
        } else {
          polylineRef.current = L.polyline(roadPoints, {
            color: "hsl(24, 95%, 53%)",
            weight: 5,
            opacity: 0.85,
            lineCap: "round",
            lineJoin: "round",
          }).addTo(map);
        }
      });
    } else if (polylineRef.current) {
      map.removeLayer(polylineRef.current);
      polylineRef.current = null;
    }

    // Fit bounds
    const allPoints: L.LatLngExpression[] = [[driverLat, driverLng]];
    if (hasRestaurant) allPoints.push([restaurantLat, restaurantLng]);
    if (hasClient) allPoints.push([clientLat, clientLng]);

    if (allPoints.length === 1) {
      map.setView(allPoints[0], 15, { animate: true });
    } else {
      const bounds = L.latLngBounds(allPoints.map((p) => L.latLng(p as [number, number])));
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16, animate: true });
    }
  }, [driverLat, driverLng, restaurantLat, restaurantLng, clientLat, clientLng, hasRestaurant, hasClient]);

  return (
    <div
      ref={containerRef}
      className="h-64 w-full rounded-xl overflow-hidden border shadow-card"
    />
  );
};

export default DeliveryMap;
