import { MapPin, Clock, Package, CheckCircle2, Loader2, Truck } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import OrderItemsDisplay from "@/components/order/OrderItemsDisplay";
import { Link, useNavigate } from "react-router-dom";
import { fetchAvailableOrders, claimOrders } from "@/services/deliveryApiService";
import DeliveryLayout from "@/layouts/DeliveryLayout";
import { useDeliveryDriver } from "@/hooks/useDeliveryDriver";
import { safeToast } from "@/lib/safeToast";
import { useState } from "react";
import type { Tables } from "@/integrations/supabase/types";

const DeliveryList = () => {
  const { driver, driverCode, isLoading: driverLoading, loginForm, logout } = useDeliveryDriver();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string[]>([]);

  const { data: orders, isLoading } = useQuery({
    queryKey: ["delivery-ready-orders", driver?.id],
    queryFn: () => fetchAvailableOrders(),
    enabled: !!driver?.can_deliver,
    refetchInterval: 8000,
  });

  const orderIds = (orders || []).map((order) => order.id);
  const { data: orderItemsMap } = useQuery({
    queryKey: ["delivery-list-items", orderIds.join(",")],
    queryFn: async () => {
      if (orderIds.length === 0) return {};
      const { data: items } = await supabase.from("order_items").select("*").in("order_id", orderIds);
      if (!items) return {};
      const itemIds = items.map((i) => i.id);
      let choices: Tables<"order_item_choices">[] = [];
      if (itemIds.length > 0) {
        const { data: ch } = await supabase.from("order_item_choices").select("*").in("order_item_id", itemIds);
        choices = ch || [];
      }
      const map: Record<string, (Tables<"order_items"> & { choices: Tables<"order_item_choices">[] })[]> = {};
      for (const item of items) {
        if (!map[item.order_id]) map[item.order_id] = [];
        map[item.order_id].push({ ...item, choices: choices.filter((c) => c.order_item_id === item.id) });
      }
      return map;
    },
    enabled: orderIds.length > 0,
    staleTime: 30000,
  });

  const navigate = useNavigate();

  const claimMut = useMutation({
    mutationFn: () => claimOrders(selected),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["delivery-ready-orders"] });
      queryClient.invalidateQueries({ queryKey: ["active-assignments"] });
      safeToast.success(`${data.claimed} commande(s) prise(s) en charge`);
      setSelected([]);
      // Auto-switch to course tab
      navigate("/delivery/active");
    },
    onError: (error) => safeToast.error(error.message),
  });

  const toggleSelect = (orderId: string) => {
    setSelected((prev) =>
      prev.includes(orderId) ? prev.filter((id) => id !== orderId) : [...prev, orderId]
    );
  };

  if (driverLoading) {
    return (
      <DeliveryLayout>
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      </DeliveryLayout>
    );
  }

  if (!driver) {
    return <DeliveryLayout>{loginForm}</DeliveryLayout>;
  }
  if (!driver.can_deliver) return <DeliveryLayout driverCode={driverCode} onLogout={logout} canServe={driver.can_serve}><div className="p-6 text-center text-sm">Votre compte n’a pas l’accès livraison.{driver.can_serve && <Link className="mt-3 block font-bold text-primary" to="/delivery/service">Ouvrir le service en salle</Link>}</div></DeliveryLayout>;

  return (
    <DeliveryLayout driverCode={driverCode} onLogout={logout} canDeliver={driver.can_deliver} canServe={driver.can_serve}>
      <div className="animate-fade-in px-4 pt-4 pb-24">
        <h1 className="mb-1 text-xl font-extrabold text-foreground">
          Courses disponibles
        </h1>
        <p className="mb-4 text-sm text-muted-foreground">
          {orders?.length ?? 0} commande{(orders?.length ?? 0) !== 1 ? "s" : ""} en attente
        </p>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : !orders || orders.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-muted-foreground">
            <Truck className="mb-3 h-10 w-10" />
            <p className="text-sm">Aucune commande en attente</p>
            <p className="mt-1 text-xs">Les nouvelles courses apparaîtront ici</p>
          </div>
        ) : (
          <div className="space-y-3">
            {orders.map((order) => {
              const isSelected = selected.includes(order.id);
              return (
                <div
                  key={order.id}
                  onClick={() => toggleSelect(order.id)}
                  className={`cursor-pointer rounded-xl border-2 bg-card p-4 shadow-card transition-colors ${
                    isSelected ? "border-primary bg-primary/5" : "border-transparent"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className={`flex h-10 w-10 items-center justify-center rounded-lg text-lg font-extrabold ${
                          isSelected
                            ? "bg-primary text-primary-foreground"
                            : "bg-success/10 text-success"
                        }`}
                      >
                        {order.order_number}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-card-foreground">
                          Commande #{String(order.order_number).padStart(3, "0")}
                        </p>
                        <p className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Package className="h-3 w-3" />
                          Livraison
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="flex items-center gap-1 text-xs text-success">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Prête
                      </span>
                      <span className="text-xs font-semibold text-foreground">
                        {Number(order.total).toFixed(2)} €
                      </span>
                    </div>
                  </div>

                  <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      {new Date(order.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    {order.delivery_address && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" />
                        {order.delivery_address}{order.delivery_postcode ? ` · ${order.delivery_postcode}` : ""}
                      </span>
                    )}
                  </div>

                  {/* Order items */}
                  {orderItemsMap?.[order.id] && (
                    <OrderItemsDisplay items={orderItemsMap[order.id]} compact />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Floating claim button */}
        {selected.length > 0 && (
          <div className="fixed bottom-16 left-0 right-0 z-50 px-4 pb-4">
            <button
              onClick={() => claimMut.mutate()}
              disabled={claimMut.isPending}
              className="w-full rounded-xl bg-primary py-3.5 text-sm font-bold text-primary-foreground shadow-lg transition-transform active:scale-[0.98] disabled:opacity-60"
            >
              {claimMut.isPending
                ? "Attribution..."
                : `Récupérer ${selected.length} commande${selected.length > 1 ? "s" : ""} au restaurant`}
            </button>
          </div>
        )}
      </div>
    </DeliveryLayout>
  );
};

export default DeliveryList;


