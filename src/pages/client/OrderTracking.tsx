import { Clock, Loader2, Lock, Truck, MapPin, ShoppingBag } from "lucide-react";
import { useParams, Navigate, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchOrderById } from "@/services/orderService";
import { fetchRestaurants } from "@/services/restaurantService";
import { useRealtimeOrder } from "@/hooks/useRealtimeOrder";
import { useRealtimeDriverLocation } from "@/hooks/useRealtimeDriverLocation";
import { useClientNotificationSound } from "@/hooks/useClientNotificationSound";
import { supabase } from "@/integrations/supabase/client";
import ClientLayout from "@/layouts/ClientLayout";
import { lazy, Suspense, useEffect, useState, useCallback } from "react";
import { useCart } from "@/contexts/useCart";
import { searchAddress } from "@/lib/geo";

const DeliveryMap = lazy(() => import("@/components/client/DeliveryMap"));
import OrderChat from "@/components/client/OrderChat";

import { readMenuReceipt } from "@/services/digitalMenuService";

const STEPS = [
  { key: "pending", label: "Commande reçue" },
  { key: "preparing", label: "En préparation" },
  { key: "ready", label: "Prête" },
  { key: "waiting_delivery", label: "En attente du livreur" },
  { key: "in_delivery", label: "En livraison" },
  { key: "delivered", label: "Livrée" },
];

const statusIndex = (status: string) => {
  const idx = STEPS.findIndex((s) => s.key === status);
  return idx >= 0 ? idx : 0;
};

const formatTime = (dateStr: string | null | undefined) => {
  if (!dateStr) return null;
  return new Date(dateStr).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
};

const PAYMENT_LABELS: Record<string, string> = {
  cash: "Paiement en espèces",
  card_counter: "Paiement par carte au comptoir",
  card_delivery: "Paiement par carte au livreur",
  wero: "Payé via Wero",
  online: "Payé en ligne",
};

const OrderTracking = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { clearCart } = useCart();
  const { id: paramId } = useParams<{ id: string }>();
  const id = paramId || localStorage.getItem("rzfood_last_order_id") || undefined;
  const isGuestReceipt = !!id && !!readMenuReceipt(id);

  const { data: order, isLoading, error } = useQuery({
    queryKey: ["order", id],
    queryFn: () => fetchOrderById(id!),
    enabled: !!id,
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: 10000,
  });

  useRealtimeOrder(isGuestReceipt ? undefined : id);
  useClientNotificationSound(order?.status);

  const [driverId, setDriverId] = useState<string | undefined>();
  const [restaurantCoords, setRestaurantCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [clientCoords, setClientCoords] = useState<{ lat: number; lng: number } | null>(null);
  const deliveryAddress = order?.delivery_address;
  const deliveryLat = order?.delivery_lat;
  const deliveryLng = order?.delivery_lng;
  const orderId = order?.id;
  const orderStatus = order?.status;
  const orderType = order?.order_type;

  // Fetch restaurant coordinates from DB
  useEffect(() => {
    if (!order?.restaurant_id) return;
    supabase
      .from("restaurants")
      .select("latitude, longitude")
      .eq("id", order.restaurant_id)
      .single()
      .then(({ data }) => {
        if (data?.latitude && data?.longitude) {
          setRestaurantCoords({ lat: Number(data.latitude), lng: Number(data.longitude) });
        }
      });
  }, [order?.restaurant_id]);

  // Use stored delivery coordinates if available, otherwise geocode
  useEffect(() => {
    // Check for stored coordinates first
    if (deliveryLat != null && deliveryLng != null) {
      setClientCoords({ lat: Number(deliveryLat), lng: Number(deliveryLng) });
      return;
    }
    // Fallback: geocode the delivery address
    if (!deliveryAddress) return;
    let cancelled = false;
    searchAddress(deliveryAddress).then((results) => {
      if (cancelled || results.length === 0) return;
      setClientCoords({ lat: results[0].lat, lng: results[0].lng });
    });
    return () => { cancelled = true; };
  }, [deliveryAddress, deliveryLat, deliveryLng]);

  useEffect(() => {
    if (!orderId || orderType !== "delivery") {
      setDriverId(undefined);
      return;
    }
    // Show map for any delivery phase status
    const deliveryStatuses = ["in_delivery", "waiting_delivery", "in_transit", "picked_up"];
    if (!deliveryStatuses.includes(orderStatus ?? "")) {
      setDriverId(undefined);
      return;
    }

    const fetchAssignment = async () => {
      const { data, error } = await supabase
        .from("delivery_assignments")
        .select("driver_id, status")
        .eq("order_id", orderId)
        .in("status", ["assigned", "picked_up", "in_transit"])
        .maybeSingle();

      if (data) {
        setDriverId(data.driver_id);
      } else {
        setDriverId(undefined);
      }
    };

    fetchAssignment();

    // Also poll for assignment every 10s in case realtime misses it
    const interval = setInterval(fetchAssignment, 10000);
    return () => clearInterval(interval);
  }, [orderId, orderStatus, orderType]);

  const driverLocation = useRealtimeDriverLocation(driverId);

  // Force re-render every second to update "mis à jour il y a Xs"
  const [, setTick] = useState(0);
  const hasDriverLocation = Boolean(driverLocation);
  useEffect(() => {
    if (!hasDriverLocation) return;
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [hasDriverLocation]);

  if (!paramId && id) return <Navigate to={`/orders/${id}`} replace />;

  if (isLoading) {
    return (
      <ClientLayout>
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      </ClientLayout>
    );
  }

  if (error || !order) {
    return (
      <ClientLayout>
        <div className="px-4 py-20 text-center text-muted-foreground">Commande introuvable</div>
      </ClientLayout>
    );
  }

  const isDelivery = order.order_type === "delivery";
  const currentStepIdx = !isDelivery && order.status === "ready" ? statusIndex("preparing") : statusIndex(order.status);
  const isFinished = ["delivered", "cancelled"].includes(order.status) || 
    (!isDelivery && order.status === "ready");

  const handleNewOrder = async () => {
    clearCart();
    localStorage.removeItem("rzfood_last_order_id");
    // Prefetch restaurants so Home renders instantly
    queryClient.prefetchQuery({ queryKey: ["restaurants"], queryFn: fetchRestaurants });
    navigate(isGuestReceipt ? "/menu/la-parmigiana" : "/home");
  };

  const visibleSteps = isDelivery
    ? STEPS
    : STEPS.filter((s) => !["ready", "waiting_delivery", "in_delivery", "delivered"].includes(s.key));

  const stepTimestamps: Record<string, string | null> = {
    pending: formatTime(order.created_at),
    preparing: formatTime(order.accepted_at),
    ready: formatTime(order.ready_at),
    waiting_delivery: formatTime(order.ready_at),
    in_delivery: null,
    delivered: null,
  };

  // Dynamic payment label based on saved payment_method
  const paymentMethod = order.payment_method || "cash";
  const paymentLabel = PAYMENT_LABELS[paymentMethod] || (
    order.order_type === "dine_in" ? "À payer sur place"
    : order.order_type === "takeaway" ? "À régler au comptoir"
    : "Paiement à la livraison"
  );

  const isPaid = paymentMethod === "wero" || paymentMethod === "online";
  const includeRestaurantInRoute = order.status === "waiting_delivery";

  return (
    <ClientLayout>
      <div className="animate-fade-in px-4 pt-6 pb-10">
        {/* Header */}
        <div className="mb-6 text-center">
          <h1 className="text-xl font-extrabold text-foreground">
            Commande #{String(order.order_number).padStart(3, "0")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {order.order_type === "takeaway" ? "À emporter" : order.order_type === "dine_in" ? "Sur place" : "Livraison"}
          </p>
          <p className="mt-2 text-sm font-semibold text-foreground">Commande passée à {formatTime(order.created_at) || "—"}</p>
          {order.scheduled_at && (
            <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1">
              <Clock className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs font-bold text-primary">
                Programmée à {new Date(order.scheduled_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                {" — "}
                {new Date(order.scheduled_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "long" })}
              </span>
            </div>
          )}
        </div>

        {/* Delivery code */}
        {isDelivery && order.delivery_code && (
          <div className="mb-6 rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 p-4 text-center">
            <div className="flex items-center justify-center gap-2 text-muted-foreground mb-1">
              <Lock className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase tracking-wider">Code de livraison</span>
            </div>
            <p className="text-2xl font-mono font-extrabold tracking-[0.3em] text-primary">{order.delivery_code}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">Communiquez ce code au livreur pour valider la réception</p>
          </div>
        )}

        {/* GPS Map — show when driver location available and order in delivery */}
        {driverLocation && isDelivery && !["delivered", "cancelled", "pending", "preparing", "ready"].includes(order.status) && (
          <div className="mb-6">
            <div className="flex items-center gap-2 text-primary mb-2">
              <MapPin className="h-5 w-5 animate-pulse" />
              <span className="text-sm font-bold">
                {order.status === "in_delivery" ? "Votre livreur est en route !" : "Livreur localisé"}
              </span>
            </div>
            <Suspense fallback={<div className="h-64 w-full rounded-xl bg-muted animate-pulse" />}>
              <DeliveryMap
                driverLat={driverLocation.latitude}
                driverLng={driverLocation.longitude}
                restaurantLat={includeRestaurantInRoute ? restaurantCoords?.lat : undefined}
                restaurantLng={includeRestaurantInRoute ? restaurantCoords?.lng : undefined}
                clientLat={clientCoords?.lat}
                clientLng={clientCoords?.lng}
              />
            </Suspense>
            <p className="mt-1 text-[11px] text-muted-foreground text-center">
              Mis à jour il y a {Math.max(0, Math.floor((Date.now() - new Date(driverLocation.updated_at).getTime()) / 1000))}s
            </p>
          </div>
        )}

        {/* Estimated time */}
        {isDelivery && !["delivered", "cancelled"].includes(order.status) && (() => {
          const etaDate = new Date(order.estimated_delivery_at || new Date(new Date(order.accepted_at || order.created_at).getTime() + 60 * 60_000).toISOString());
          const now = new Date();
          const isSameDay = etaDate.getFullYear() === now.getFullYear() && etaDate.getMonth() === now.getMonth() && etaDate.getDate() === now.getDate();
          const etaTime = etaDate.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
          const etaDateStr = etaDate.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
          const remainingMin = Math.max(0, Math.round((etaDate.getTime() - Date.now()) / 60000));
          return (
            <div className="mb-4 rounded-xl bg-accent p-3 text-center">
              <span className="text-sm font-bold text-foreground">
                {isSameDay
                  ? `🕐 ${isDelivery ? "Livraison estimée" : "Prête"} à ${etaTime} (${remainingMin} min)`
                  : `📅 ${isDelivery ? "Livraison prévue" : "Prête"} le ${etaDateStr} à ${etaTime}`
                }
              </span>
            </div>
          );
        })()}

        {/* Status message */}
        <div className="mb-6 rounded-xl bg-primary/5 p-4 text-center">
          <div className="flex items-center justify-center gap-2 text-primary">
            {order.status === "in_delivery" ? <Truck className="h-5 w-5" /> : <Clock className="h-5 w-5" />}
            <span className="text-base font-bold">
              {order.status === "pending" && "Commande transmise au restaurant"}
              {order.status === "preparing" && "En cours de préparation"}
              {order.status === "ready" && (isDelivery ? "Prête — en attente du livreur" : "Votre commande est prise en charge par l’équipe.")}
              {order.status === "waiting_delivery" && "Prête — en attente du livreur"}
              {order.status === "in_delivery" && "Le livreur est en route !"}
              {order.status === "delivered" && "Commande livrée ✓"}
            </span>
          </div>
        </div>

        {/* Status tracker */}
        <div className="mb-8 px-2">
          {visibleSteps.map((step, i) => {
            const stepIdx = STEPS.findIndex((s) => s.key === step.key);
            const done = stepIdx <= currentStepIdx;
            const active = stepIdx === currentStepIdx;
            const time = stepTimestamps[step.key];
            return (
              <div key={step.key} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
                    active ? "bg-primary text-primary-foreground animate-pulse"
                    : done ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                  }`}>{i + 1}</div>
                  {i < visibleSteps.length - 1 && <div className={`h-8 w-0.5 ${done ? "bg-primary" : "bg-muted"}`} />}
                </div>
                <div className="flex items-center gap-2 pb-8">
                  <span className={`text-sm font-medium ${active ? "text-primary" : done ? "text-foreground" : "text-muted-foreground"}`}>
                    {step.label}
                  </span>
                  {time && done && <span className="text-xs text-muted-foreground">• {time}</span>}
                </div>
              </div>
            );
          })}
        </div>

        {/* Order summary */}
        <div className="mb-6 rounded-xl border bg-card p-4 shadow-card">
          <h3 className="mb-3 text-sm font-bold text-card-foreground">Récapitulatif</h3>
          <div className="space-y-2 text-sm">
            {order.items?.map((item) => (
              <div key={item.id}>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{item.quantity}× {item.product_name}</span>
                  <span className="text-foreground">{Number(item.total_price).toFixed(2)} €</span>
                </div>
                {item.choices?.length > 0 && (
                  <p className="pl-4 text-xs text-muted-foreground">{item.choices.map((choice) => choice.option_name).join(", ")}</p>
                )}
              </div>
            ))}
            {isDelivery && Number(order.subtotal) > 0 && Number(order.total) !== Number(order.subtotal) && (
              <>
                <div className="flex justify-between border-t pt-2">
                  <span className="text-muted-foreground">Sous-total</span>
                  <span className="text-foreground">{Number(order.subtotal).toFixed(2)} €</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Frais de livraison</span>
                  <span className="text-foreground">{(Number(order.total) - Number(order.subtotal)).toFixed(2)} €</span>
                </div>
              </>
            )}
            <div className={`flex justify-between font-bold ${!(isDelivery && Number(order.subtotal) > 0 && Number(order.total) !== Number(order.subtotal)) ? 'border-t pt-2' : ''}`}>
              <span className="text-foreground">Total</span>
              <span className="text-primary">{Number(order.total).toFixed(2)} €</span>
            </div>
          </div>
        </div>

        {/* Payment status */}
        {!isGuestReceipt && <div className="text-center">
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
            isPaid ? "bg-success/10 text-success" : "bg-warning/10 text-warning"
          }`}>
            {paymentLabel}
          </span>
        </div>}

        {/* New order button — shown when order is finished */}
        {isFinished && (
          <>
            <button
              onClick={handleNewOrder}
              className="mt-6 w-full flex items-center justify-center gap-2 rounded-xl bg-primary py-4 text-base font-bold text-primary-foreground shadow-float transition-transform active:scale-[0.98]"
            >
              <ShoppingBag className="h-5 w-5" />
              Nouvelle commande
            </button>
          </>
        )}

        {/* Chat */}
        {!isGuestReceipt && <OrderChat
          orderId={order.id}
          orderStatus={order.status}
          orderType={order.order_type}
          hasDriver={!!driverId}
        />}
      </div>
    </ClientLayout>
  );
};

export default OrderTracking;
