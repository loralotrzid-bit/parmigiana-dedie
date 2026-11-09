import { ArrowLeft, Loader2, Truck, Calendar, MapPin, Navigation } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "react-router-dom";
import { fetchDriversByRestaurant } from "@/services/deliveryDriverService";
import { useAuth } from "@/contexts/useAuth";
import AdminLayout from "@/layouts/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { useMemo, useEffect, useState, lazy, Suspense } from "react";

const DeliveryMap = lazy(() => import("@/components/client/DeliveryMap"));

const fetchDriverAssignments = async (driverId: string) => {
  const { data, error } = await supabase
    .from("delivery_assignments")
    .select("*, orders!inner(order_number, delivery_address, delivery_postcode, total, created_at, status)")
    .eq("driver_id", driverId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return data;
};

const DriverLiveLocation = ({ driverId }: { driverId: string }) => {
  const { data: location, isLoading } = useQuery({
    queryKey: ["driver-location-admin", driverId],
    queryFn: async () => {
      const { data } = await supabase
        .from("driver_locations")
        .select("*")
        .eq("driver_id", driverId)
        .maybeSingle();
      return data;
    },
    refetchInterval: 5000,
  });

  if (isLoading) return null;
  if (!location) {
    return (
      <div className="mb-4 rounded-xl border bg-muted/30 p-4 text-center">
        <MapPin className="mx-auto mb-1 h-5 w-5 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">Position GPS non disponible</p>
      </div>
    );
  }

  const updatedAgo = Math.floor((Date.now() - new Date(location.updated_at).getTime()) / 1000);
  const isRecent = updatedAgo < 120;

  return (
    <div className="mb-4 space-y-2">
      <div className={`rounded-xl border p-3 ${isRecent ? "border-success/30 bg-success/5" : "border-warning/30 bg-warning/5"}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Navigation className={`h-4 w-4 ${isRecent ? "text-success" : "text-warning"}`} />
            <span className="text-xs font-bold text-foreground">
              {isRecent ? "Position en direct" : "Dernière position connue"}
            </span>
          </div>
          <span className="text-[11px] text-muted-foreground">
            {updatedAgo < 60 ? `il y a ${updatedAgo}s` : `il y a ${Math.floor(updatedAgo / 60)} min`}
          </span>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {Number(location.latitude).toFixed(5)}, {Number(location.longitude).toFixed(5)}
          {location.speed && Number(location.speed) > 0 && ` · ${(Number(location.speed) * 3.6).toFixed(0)} km/h`}
        </p>
      </div>
      <div className="h-48 rounded-xl overflow-hidden border">
        <Suspense fallback={<div className="flex h-full items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>}>
          <DeliveryMap
            driverLat={Number(location.latitude)}
            driverLng={Number(location.longitude)}
          />
        </Suspense>
      </div>
    </div>
  );
};

const DriverHistory = () => {
  const { driverId } = useParams<{ driverId: string }>();
  const { restaurantId } = useAuth();

  const { data: drivers } = useQuery({
    queryKey: ["drivers", restaurantId],
    queryFn: () => fetchDriversByRestaurant(restaurantId!),
    enabled: !!restaurantId,
  });

  const driver = drivers?.find((d) => d.id === driverId);

  const { data: assignments, isLoading } = useQuery({
    queryKey: ["driver-history", driverId],
    queryFn: () => fetchDriverAssignments(driverId!),
    enabled: !!driverId,
  });

  const stats = useMemo(() => {
    if (!assignments) return { today: 0, week: 0, month: 0 };
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfWeek = startOfDay - now.getDay() * 86400000;
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    return {
      today: assignments.filter((a) => new Date(a.created_at).getTime() >= startOfDay && a.status === "delivered").length,
      week: assignments.filter((a) => new Date(a.created_at).getTime() >= startOfWeek && a.status === "delivered").length,
      month: assignments.filter((a) => new Date(a.created_at).getTime() >= startOfMonth && a.status === "delivered").length,
    };
  }, [assignments]);

  return (
    <AdminLayout>
      <div className="animate-fade-in px-4 pt-4 pb-20">
        <Link to="/admin/drivers" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground">
          <ArrowLeft className="h-4 w-4" /> Retour
        </Link>

        <h1 className="text-xl font-extrabold text-foreground mb-1">
          {driver ? driver.full_name : "Livreur"}
        </h1>
        {driver && (
          <p className="text-xs text-muted-foreground mb-4">Code : {driver.driver_code}</p>
        )}

        {/* Live GPS tracking */}
        <DriverLiveLocation driverId={driverId!} />

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          {[
            { label: "Aujourd'hui", value: stats.today },
            { label: "Semaine", value: stats.week },
            { label: "Mois", value: stats.month },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border bg-card p-3 text-center shadow-card">
              <p className="text-lg font-extrabold text-primary">{s.value}</p>
              <p className="text-[11px] text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : !assignments || assignments.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            <Truck className="mx-auto mb-3 h-10 w-10" />
            Aucune livraison enregistrée
          </div>
        ) : (
          <div className="space-y-2">
            {assignments.map((a) => {
              const order = a.orders;
              const date = new Date(a.created_at);
              const statusLabels: Record<string, string> = {
                assigned: "Assignée",
                picked_up: "Récupérée",
                in_transit: "En route",
                delivered: "Livrée",
              };
              return (
                <div key={a.id} className="rounded-xl border bg-card p-3 shadow-card">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-bold text-card-foreground">
                      #{String(order.order_number).padStart(3, "0")}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      a.status === "delivered" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"
                    }`}>
                      {statusLabels[a.status] || a.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    {date.toLocaleDateString("fr-FR")} à {date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                  </div>
                  {order.delivery_address && (
                    <p className="mt-1 text-xs text-muted-foreground truncate">📍 {order.delivery_address}{order.delivery_postcode ? ` · ${order.delivery_postcode}` : ""}</p>
                  )}
                  <p className="mt-1 text-xs font-semibold text-foreground">{Number(order.total).toFixed(2)} €</p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default DriverHistory;
