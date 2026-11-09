import { Phone, CheckCircle2, Truck, Loader2, Lock, Clock, Banknote, CreditCard, Route, ArrowUpDown, Zap, Trash2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchMyAssignments, updateDeliveryStatus, releaseAllAssignments, type DeliveryOrderPayload, type DeliveryAssignmentPayload } from "@/services/deliveryApiService";
import OrderItemsDisplay from "@/components/order/OrderItemsDisplay";
import { useDeliveryDriver } from "@/hooks/useDeliveryDriver";
import { supabase } from "@/integrations/supabase/client";
import { useDriverGps } from "@/hooks/useDriverGps";
import DeliveryLayout from "@/layouts/DeliveryLayout";
import ChangeCalculator from "@/components/delivery/ChangeCalculator";
import NavigationChooser from "@/components/delivery/NavigationChooser";
import OrderChatWidget from "@/components/chat/OrderChatWidget";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useState } from "react";
import { safeToast } from "@/lib/safeToast";
import { haversineKm } from "@/lib/geo";
import type { Tables } from "@/integrations/supabase/types";

const PAYMENT_LABELS: Record<string, string> = {
  cash: "Cash", card_delivery: "Carte", wero: "Wero", card_counter: "Carte comptoir", online: "En ligne",
};

const ActiveDelivery = () => {
  const { driver, driverCode, isLoading: driverLoading, loginForm, logout } = useDeliveryDriver();
  const queryClient = useQueryClient();
  const [deliveryCodes, setDeliveryCodes] = useState<Record<string, string>>({});
  const [routeMode, setRouteMode] = useState<"idle" | "choosing" | "optimized" | "manual">("idle");
  const [manualOrder, setManualOrder] = useState<string[]>([]);

  const { data: assignments, isLoading } = useQuery({
    queryKey: ["active-assignments", driver?.id],
    queryFn: () => fetchMyAssignments(),
    enabled: !!driver,
    refetchInterval: 10000,
  });

  const activeList = assignments || [];
  const orderIds = activeList.map((a) => a.orders?.id).filter((id): id is string => Boolean(id));

  const { data: orderItemsMap } = useQuery({
    queryKey: ["delivery-order-items", orderIds.join(",")],
    queryFn: async () => {
      if (orderIds.length === 0) return {};
      const { data: items } = await supabase
        .from("order_items")
        .select("*")
        .in("order_id", orderIds);
      if (!items) return {};
      const itemIds = items.map((i) => i.id);
      let choices: Tables<"order_item_choices">[] = [];
      if (itemIds.length > 0) {
        const { data: ch } = await supabase
          .from("order_item_choices")
          .select("*")
          .in("order_item_id", itemIds);
        choices = ch || [];
      }
      const map: Record<string, (Tables<"order_items"> & { choices: Tables<"order_item_choices">[] })[]> = {};
      for (const item of items) {
        if (!map[item.order_id]) map[item.order_id] = [];
        map[item.order_id].push({
          ...item,
          choices: choices.filter((c) => c.order_item_id === item.id),
        });
      }
      return map;
    },
    enabled: orderIds.length > 0,
    staleTime: 30000,
  });

  const hasActiveDeliveries = activeList.length > 0;

  useDriverGps(driver?.id, hasActiveDeliveries);

  const updateMut = useMutation({
    mutationFn: async (variables: { assignmentId: string; status: string; code?: string }) => {
      await updateDeliveryStatus(variables.assignmentId, variables.status, variables.code);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["active-assignments"] });
      queryClient.invalidateQueries({ queryKey: ["delivery-ready-orders"] });
      safeToast.success("Statut mis à jour");
      setDeliveryCodes((prev) => {
        const next = { ...prev };
        delete next[variables.assignmentId];
        return next;
      });
    },
    onError: (error) => {
      const msg = error.message?.toLowerCase() || "";
      if (msg.includes("code") || msg.includes("invalid") || msg.includes("mismatch")) {
        safeToast.error("Code erroné");
      } else {
        safeToast.error(error.message);
      }
    },
  });

  const releaseMut = useMutation({
    mutationFn: () => releaseAllAssignments(),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["active-assignments"] });
      queryClient.invalidateQueries({ queryKey: ["delivery-ready-orders"] });
      safeToast.success(`${data.released} course(s) libérée(s)`);
      setRouteMode("idle");
      setManualOrder([]);
    },
    onError: (error) => safeToast.error(error.message),
  });

  if (driverLoading) {
    return <DeliveryLayout><div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div></DeliveryLayout>;
  }

  if (!driver) return <DeliveryLayout>{loginForm}</DeliveryLayout>;
  if (!driver.can_deliver) return <DeliveryLayout driverCode={driverCode} onLogout={logout} canServe={driver.can_serve}><div className="p-6 text-center text-sm">Votre compte n’a pas l’accès livraison.</div></DeliveryLayout>;

  const sorted = [...activeList].sort((a, b) => (a.delivery_order ?? 1) - (b.delivery_order ?? 1));
  const currentInTransit = sorted.find((a) => a.status === "in_transit");

  // --- Route optimization helpers ---
  const optimizeRoute = () => {
    if (!navigator.geolocation) {
      safeToast.error("Géolocalisation non supportée");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const myLat = pos.coords.latitude;
        const myLng = pos.coords.longitude;
        // Nearest-neighbor greedy sort
        const remaining = [...sorted];
        const ordered: typeof remaining = [];
        let curLat = myLat, curLng = myLng;
        while (remaining.length > 0) {
          let bestIdx = 0;
          let bestDist = Infinity;
          remaining.forEach((a, i) => {
            const order = a.orders;
            if (!order?.delivery_lat || !order?.delivery_lng) return;
            const d = haversineKm(curLat, curLng, order.delivery_lat, order.delivery_lng);
            if (d < bestDist) { bestDist = d; bestIdx = i; }
          });
          const picked = remaining.splice(bestIdx, 1)[0];
          ordered.push(picked);
          const o = picked.orders;
          if (o?.delivery_lat && o?.delivery_lng) { curLat = o.delivery_lat; curLng = o.delivery_lng; }
        }
        setManualOrder(ordered.map((a) => a.id));
        setRouteMode("optimized");
        safeToast.success("Itinéraire optimisé !");
      },
      () => {
        // Fallback: sort by existing delivery_order
        setManualOrder(sorted.map((a) => a.id));
        setRouteMode("optimized");
        safeToast.info("Position GPS indisponible, tri par défaut appliqué");
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const startManual = () => {
    setManualOrder([]);
    setRouteMode("manual");
  };

  const toggleManualSelect = (id: string) => {
    setManualOrder((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const confirmManualOrder = () => {
    if (manualOrder.length !== sorted.length) {
      safeToast.error("Sélectionnez toutes les commandes dans l'ordre souhaité");
      return;
    }
    setRouteMode("manual");
  };

  // Apply route ordering
  const displayList = routeMode === "optimized" || (routeMode === "manual" && manualOrder.length === sorted.length)
    ? manualOrder.map((id) => sorted.find((a) => a.id === id)).filter((a): a is DeliveryAssignmentPayload => Boolean(a))
    : sorted;

  /** Render caisse section for an order */
  const renderCaisse = (order: DeliveryOrderPayload) => {
    const paymentMethod = order.payment_method || "cash";
    const cashDetails = order.cash_details as { counts?: Record<string, number>; total?: number } | null;
    const orderTotal = Number(order.total);

    if (paymentMethod !== "cash") {
      return (
        <div className="rounded-xl border bg-card p-4 shadow-card">
          <h3 className="mb-2 text-sm font-bold text-card-foreground">Caisse</h3>
          <div className="flex items-center gap-2 rounded-lg bg-success/10 p-3">
            {paymentMethod === "card_delivery" ? <CreditCard className="h-5 w-5 text-success" /> : <CheckCircle2 className="h-5 w-5 text-success" />}
            <div>
              <p className="text-sm font-bold text-success">
                {paymentMethod === "card_delivery" ? "Paiement par carte" : "Déjà payé"}
              </p>
              <p className="text-xs text-muted-foreground">{PAYMENT_LABELS[paymentMethod] || paymentMethod}</p>
            </div>
          </div>
        </div>
      );
    }

    if (cashDetails?.counts && Object.keys(cashDetails.counts).length > 0) {
      const clientTotal = cashDetails.total ?? 0;
      const change = clientTotal - orderTotal;
      return (
        <div className="rounded-xl border bg-card p-4 shadow-card">
          <h3 className="mb-2 text-sm font-bold text-card-foreground flex items-center gap-2">
            <Banknote className="h-4 w-4" /> Caisse — Cash
          </h3>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total commande</span>
              <span className="font-semibold text-foreground">{orderTotal.toFixed(2)} €</span>
            </div>
            <div className="border-t pt-1.5">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase mb-1">Client paie avec :</p>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(cashDetails.counts).map(([val, qty]) => (
                  <span key={val} className="rounded-md bg-accent px-2 py-0.5 text-xs font-semibold text-foreground">
                    {qty}× {Number(val) >= 1 ? `${Number(val)} €` : `${Number(val) * 100}c`}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Montant donné</span>
              <span className="font-bold text-foreground">{clientTotal.toFixed(2)} €</span>
            </div>
            {change >= 0 && (
              <div className="flex justify-between border-t pt-1.5">
                <span className="font-bold text-foreground">À rendre</span>
                <span className="text-lg font-extrabold text-success">{change.toFixed(2)} €</span>
              </div>
            )}
          </div>
        </div>
      );
    }

    return <ChangeCalculator orderTotal={orderTotal} />;
  };

  const isRouteActive = routeMode === "optimized" || (routeMode === "manual" && manualOrder.length === sorted.length);
  const isManualSelecting = routeMode === "manual" && manualOrder.length < sorted.length;

  /** In guided mode, render a full card for the "current" delivery and collapsed cards for the rest */
  const renderGuidedCard = (assignment: DeliveryAssignmentPayload, idx: number, isGuided: boolean) => {
    const order = assignment.orders;
    if (!order) return null;

    const isCurrentDelivery = currentInTransit?.id === assignment.id;
    const address = order.delivery_address || order.note || "";
    const phone = order.client_phone;
    const manualIdx = manualOrder.indexOf(assignment.id);
    // In guided route mode, only the first card is "active"
    const isActiveGuided = isGuided && idx === 0;
    const isCollapsed = isGuided && idx > 0;

    if (isManualSelecting) {
      return (
        <div
          key={assignment.id}
          onClick={() => toggleManualSelect(assignment.id)}
          className={`rounded-xl border bg-card p-4 shadow-card transition-colors cursor-pointer ${
            manualIdx >= 0 ? "border-primary bg-primary/5" : "border-border"
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {manualIdx >= 0 ? (
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{manualIdx + 1}</span>
              ) : (
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">?</span>
              )}
              <h3 className="text-sm font-bold text-card-foreground">#{String(order.order_number).padStart(3, "0")}</h3>
            </div>
            <span className="text-xs text-muted-foreground">{address ? `📍 ${address.substring(0, 30)}…` : ""}</span>
          </div>
        </div>
      );
    }

    // Collapsed card for guided mode (upcoming deliveries)
    if (isCollapsed) {
      return (
        <div key={assignment.id} className="rounded-xl border border-border bg-muted/30 p-3 opacity-70">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground">{idx + 1}</span>
              <h3 className="text-xs font-semibold text-muted-foreground">#{String(order.order_number).padStart(3, "0")}</h3>
              <span className="text-[11px] text-muted-foreground">{Number(order.total).toFixed(2)} €</span>
            </div>
            <span className="text-[10px] text-muted-foreground truncate max-w-[140px]">{address ? `📍 ${address.substring(0, 25)}…` : ""}</span>
          </div>
        </div>
      );
    }

    // Full card — ADHD-friendly: big text, clear sections, high contrast
    return (
      <div key={assignment.id} className={`rounded-2xl border-2 bg-card p-5 shadow-lg transition-colors ${isActiveGuided ? "border-primary ring-2 ring-primary/30" : "border-border"}`}>
        {isActiveGuided && (
          <div className="flex items-center gap-2 mb-4 rounded-xl bg-primary/10 px-4 py-2.5">
            <Truck className="h-5 w-5 text-primary" />
            <span className="text-sm font-extrabold text-primary">🚀 Prochaine livraison • Étape {idx + 1}/{displayList.length}</span>
          </div>
        )}

        {/* Header: order number + status */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-extrabold text-primary-foreground shadow-md">{idx + 1}</span>
            <h3 className="text-lg font-extrabold text-foreground tracking-tight">Commande #{String(order.order_number).padStart(3, "0")}</h3>
          </div>
          <div className="flex items-center gap-2">
            {assignment.picked_up_at && (
              <span className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-extrabold ${
                Math.floor((Date.now() - new Date(assignment.picked_up_at).getTime()) / 60000) > 30
                  ? "bg-destructive/15 text-destructive"
                  : Math.floor((Date.now() - new Date(assignment.picked_up_at).getTime()) / 60000) > 15
                    ? "bg-warning/15 text-warning"
                    : "bg-info/15 text-info"
              }`}>
                <Clock className="h-3.5 w-3.5" />
                {Math.floor((Date.now() - new Date(assignment.picked_up_at).getTime()) / 60000)} min
              </span>
            )}
            <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-extrabold text-primary">
              {assignment.status === "assigned" && "Assignée"}
              {assignment.status === "picked_up" && "Récupérée"}
              {assignment.status === "in_transit" && "En route"}
            </span>
          </div>
        </div>

        {/* Key info: price, ETA, address, note — BIG and scannable */}
        <div className="space-y-2.5 mb-4 rounded-xl bg-muted/40 p-4">
          <p className="text-2xl font-black text-foreground">{Number(order.total).toFixed(2)} €</p>
          
          {order.estimated_delivery_at && (() => {
            const etaDate = new Date(order.estimated_delivery_at);
            const etaTime = etaDate.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
            const remainingMin = Math.max(0, Math.round((etaDate.getTime() - Date.now()) / 60000));
            return (
              <p className="text-base font-bold text-primary flex items-center gap-2">
                🕐 À {etaTime} <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-sm font-extrabold">({remainingMin} min)</span>
              </p>
            );
          })()}
          
          {address && (
            <p className="text-base font-semibold text-foreground flex items-start gap-2">
              <span className="text-lg">📍</span>
              <span className="leading-snug">{address}</span>
            </p>
          )}
          
          {order.note && (
            <p className="text-sm font-medium text-muted-foreground flex items-start gap-2 bg-warning/10 rounded-lg px-3 py-2">
              <span className="text-base">📝</span>
              <span className="leading-snug">{order.note}</span>
            </p>
          )}

          {phone && (
            <p className="text-sm font-semibold text-foreground flex items-center gap-2">
              <span className="text-base">📞</span>
              Client: {order.note?.split("|").pop()?.trim() || phone}
            </p>
          )}
        </div>

        {/* Order items — large mode */}
        {orderItemsMap?.[order.id] && (
          <OrderItemsDisplay items={orderItemsMap[order.id]} large />
        )}

        {/* Navigation */}
        {address && (
          <div className="my-4">
            <NavigationChooser address={address} compact={activeList.length === 1} />
          </div>
        )}

        {/* Chat with client */}
        {order.id && driver && (
          <div className="mb-4">
            <OrderChatWidget
              orderId={order.id}
              senderType="driver"
              senderId={driver.id}
              inline
            />
          </div>
        )}

        {/* Call button */}
        {assignment.status === "in_transit" && isCurrentDelivery && phone && (
          <a href={`tel:%2331%23${phone}`}
            className="mb-4 flex items-center justify-center gap-2 rounded-xl border-2 py-3 text-sm font-bold text-foreground hover:bg-accent transition-colors">
            <Phone className="h-4 w-4" /> Appeler (masqué)
          </a>
        )}

        {assignment.status === "assigned" && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button disabled={updateMut.isPending}
                className="w-full rounded-xl bg-primary py-3.5 text-base font-extrabold text-primary-foreground disabled:opacity-60 shadow-md">
                📦 Confirmer récupération
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Confirmer la récupération ?</AlertDialogTitle>
                <AlertDialogDescription>
                  Vous confirmez avoir récupéré la commande #{String(order.order_number).padStart(3, "0")} au restaurant.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annuler</AlertDialogCancel>
                <AlertDialogAction onClick={() => updateMut.mutate({ assignmentId: assignment.id, status: "picked_up" })}>
                  Confirmer
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}

        {assignment.status === "picked_up" && !currentInTransit && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button disabled={updateMut.isPending}
                className="w-full rounded-xl bg-primary py-3.5 text-base font-extrabold text-primary-foreground disabled:opacity-60 shadow-md">
                🚗 En route vers le client
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Démarrer la livraison ?</AlertDialogTitle>
                <AlertDialogDescription>
                  Vous confirmez être en route vers le client pour la commande #{String(order.order_number).padStart(3, "0")}.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annuler</AlertDialogCancel>
                <AlertDialogAction onClick={() => updateMut.mutate({ assignmentId: assignment.id, status: "in_transit" })}>
                  Confirmer
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}

        {assignment.status === "in_transit" && isCurrentDelivery && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-muted-foreground shrink-0" />
              <input
                value={deliveryCodes[assignment.id] || ""}
                onChange={(e) => setDeliveryCodes((prev) => ({ ...prev, [assignment.id]: e.target.value.replace(/\D/g, "").slice(0, 5) }))}
                placeholder="Code 5 chiffres"
                className="w-full min-w-0 rounded-xl border-2 bg-background px-3 py-3 text-xl font-mono text-center tracking-[0.25em] outline-none focus:border-primary"
                maxLength={5}
                inputMode="numeric"
                pattern="[0-9]*"
              />
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button
                  disabled={updateMut.isPending || !(deliveryCodes[assignment.id] || "").trim()}
                  className="w-full rounded-xl bg-success py-3.5 text-base font-extrabold text-success-foreground disabled:opacity-60 shadow-md">
                  <CheckCircle2 className="mr-1.5 inline h-5 w-5" /> Valider la livraison
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Valider la livraison ?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Vous confirmez que la commande #{String(order.order_number).padStart(3, "0")} a été livrée au client avec le code {deliveryCodes[assignment.id]}.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Annuler</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => updateMut.mutate({ assignmentId: assignment.id, status: "delivered", code: (deliveryCodes[assignment.id] || "").trim() })}
                    className="bg-success text-success-foreground hover:bg-success/90"
                  >
                    Confirmer la livraison
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}

        {assignment.status === "in_transit" && isCurrentDelivery && (
          <div className="mt-3">{renderCaisse(order)}</div>
        )}
      </div>
    );
  };

  return (
    <DeliveryLayout driverCode={driverCode} onLogout={logout} canDeliver={driver.can_deliver} canServe={driver.can_serve}>
      <div className="animate-fade-in px-4 pt-4 pb-20 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-extrabold text-foreground">Livraisons ({activeList.length})</h1>
          {activeList.length > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button className="flex items-center gap-1 rounded-lg bg-destructive/10 px-2.5 py-1.5 text-[11px] font-semibold text-destructive hover:bg-destructive/20">
                  <Trash2 className="h-3 w-3" /> Tout libérer
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Libérer toutes les courses ?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Toutes vos courses en cours seront remises en attente pour un autre livreur.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Annuler</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => releaseMut.mutate()}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Confirmer
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : activeList.length === 0 ? (
          <div className="flex flex-col items-center py-20 text-muted-foreground">
            <Truck className="mb-3 h-10 w-10" />
            <p className="text-sm">Aucune livraison en cours</p>
            <p className="mt-1 text-xs">Prenez une commande prête pour commencer</p>
          </div>
        ) : (
          <>
            {/* Route optimization controls */}
            {sorted.length >= 2 && routeMode === "idle" && (
              <button
                onClick={() => setRouteMode("choosing")}
                className="w-full flex items-center justify-center gap-2 rounded-xl border-2 border-primary bg-primary/5 py-3 text-sm font-bold text-primary transition-colors hover:bg-primary/10"
              >
                <Route className="h-5 w-5" />
                🚀 Go livraison
              </button>
            )}

            {routeMode === "choosing" && (
              <div className="rounded-xl border-2 border-primary bg-card p-4 shadow-card space-y-3">
                <p className="text-sm font-bold text-card-foreground">Choisir le mode de tournée</p>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={optimizeRoute} className="flex flex-col items-center gap-1.5 rounded-lg border-2 border-primary/30 bg-primary/5 p-3 text-xs font-semibold text-primary hover:bg-primary/10 transition-colors">
                    <Zap className="h-5 w-5" /> Optimisé
                    <span className="text-[10px] text-muted-foreground font-normal">Plus court trajet</span>
                  </button>
                  <button onClick={startManual} className="flex flex-col items-center gap-1.5 rounded-lg border-2 border-border bg-accent/30 p-3 text-xs font-semibold text-foreground hover:bg-accent transition-colors">
                    <ArrowUpDown className="h-5 w-5" /> Manuel
                    <span className="text-[10px] text-muted-foreground font-normal">Choisir l'ordre</span>
                  </button>
                </div>
                <button onClick={() => setRouteMode("idle")} className="w-full text-xs text-muted-foreground hover:text-foreground">Annuler</button>
              </div>
            )}

            {isManualSelecting && (
              <div className="rounded-xl border-2 border-primary bg-card p-3 shadow-card space-y-2">
                <p className="text-xs font-bold text-card-foreground">
                  Touchez les commandes dans l'ordre souhaité ({manualOrder.length}/{sorted.length})
                </p>
                {manualOrder.length === sorted.length && (
                  <button onClick={confirmManualOrder} className="w-full rounded-lg bg-primary py-2 text-xs font-bold text-primary-foreground">
                    ✅ Confirmer cet ordre
                  </button>
                )}
                <button onClick={() => { setRouteMode("idle"); setManualOrder([]); }} className="w-full text-[11px] text-muted-foreground hover:text-foreground">Annuler</button>
              </div>
            )}

            {isRouteActive && (
              <div className="flex items-center justify-between rounded-xl border border-success/30 bg-success/5 px-3 py-2">
                <span className="text-xs font-semibold text-success flex items-center gap-1.5">
                  <Route className="h-4 w-4" />
                  Itinéraire {routeMode === "optimized" ? "optimisé" : "manuel"} — mode guidé
                </span>
                <button onClick={() => { setRouteMode("idle"); setManualOrder([]); }} className="text-[11px] text-muted-foreground hover:text-foreground">Réinitialiser</button>
              </div>
            )}

            {displayList.map((assignment, idx) =>
              renderGuidedCard(assignment, idx, isRouteActive)
            )}
          </>
        )}
      </div>
    </DeliveryLayout>
  );
};

export default ActiveDelivery;


