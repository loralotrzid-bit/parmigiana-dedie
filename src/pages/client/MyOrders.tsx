import { ArrowLeft, Clock, ChevronRight, ShoppingBag } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchMyOrders } from "@/services/orderService";
import { fetchLocalMenuOrders } from "@/services/digitalMenuService";
import ClientLayout from "@/layouts/ClientLayout";
import { useAuth } from "@/contexts/useAuth";

type MyOrder = Awaited<ReturnType<typeof fetchMyOrders>>[number] | Awaited<ReturnType<typeof fetchLocalMenuOrders>>[number];

const ACTIVE_STATUSES = ["pending", "preparing", "ready", "waiting_delivery", "in_delivery", "in_transit", "picked_up"];

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: "En attente", color: "bg-warning/10 text-warning" },
  preparing: { label: "En préparation", color: "bg-primary/10 text-primary" },
  ready: { label: "Prête", color: "bg-success/10 text-success" },
  waiting_delivery: { label: "Attente livreur", color: "bg-primary/10 text-primary" },
  in_delivery: { label: "En livraison", color: "bg-primary/10 text-primary" },
  in_transit: { label: "En route", color: "bg-primary/10 text-primary" },
  picked_up: { label: "Récupérée", color: "bg-primary/10 text-primary" },
  delivered: { label: "Livrée", color: "bg-success/10 text-success" },
  cancelled: { label: "Annulée", color: "bg-destructive/10 text-destructive" },
};

const ORDER_TYPE_LABELS: Record<string, string> = {
  takeaway: "À emporter",
  dine_in: "Sur place",
  delivery: "Livraison",
};

const formatDate = (dateStr: string) => {
  const d = new Date(dateStr);
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
};

const formatTime = (dateStr: string) => {
  return new Date(dateStr).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
};

const MyOrders = () => {
  const navigate = useNavigate();
  const { user, isLoading: authLoading } = useAuth();
  const isGuest = !user || user.is_anonymous === true;

  const { data: orders, isLoading: ordersLoading } = useQuery({
    queryKey: ["my-orders", isGuest ? "guest-browser" : user?.id],
    queryFn: () => isGuest ? fetchLocalMenuOrders() : fetchMyOrders(user?.id),
    enabled: !authLoading,
    staleTime: 30_000,
  });

  const isLoading = authLoading || ordersLoading;
  const activeOrders = (orders || []).filter(o => ACTIVE_STATUSES.includes(o.status));
  const pastOrders = (orders || []).filter(o => !ACTIVE_STATUSES.includes(o.status));

  const handleOrderClick = (order: MyOrder) => {
    navigate(`/orders/${order.id}`);
  };

  return (
    <ClientLayout>
      <div className="animate-fade-in px-4 pt-4 pb-10">
        <button onClick={() => navigate("/account")} className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground">
          <ArrowLeft className="h-4 w-4" /> Mon compte
        </button>

        <h1 className="mb-6 text-xl font-extrabold text-foreground">Mes commandes</h1>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="animate-pulse rounded-xl border bg-card p-4">
                <div className="flex gap-3">
                  <div className="h-10 w-10 rounded-full bg-muted" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-32 bg-muted rounded" />
                    <div className="h-3 w-48 bg-muted rounded" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : !orders || orders.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-muted-foreground">
            <ShoppingBag className="mb-3 h-10 w-10" />
            <p className="text-sm font-medium">Aucune commande</p>
            <p className="mt-1 text-xs">Vos commandes apparaîtront ici.</p>
            <button
              onClick={() => navigate("/home")}
              className="mt-4 rounded-xl bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground"
            >
              Commander
            </button>
          </div>
        ) : (
          <>
            {/* Active orders */}
            {activeOrders.length > 0 && (
              <div className="mb-6">
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">En cours</p>
                <div className="space-y-2">
                  {activeOrders.map(order => (
                    <OrderCard key={order.id} order={order} onClick={() => handleOrderClick(order)} isActive />
                  ))}
                </div>
              </div>
            )}

            {/* Past orders */}
            {pastOrders.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Historique</p>
                <div className="space-y-2">
                  {pastOrders.map(order => (
                    <OrderCard key={order.id} order={order} onClick={() => handleOrderClick(order)} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </ClientLayout>
  );
};

const OrderCard = ({ order, onClick, isActive }: { order: MyOrder; onClick: () => void; isActive?: boolean }) => {
  const status = STATUS_LABELS[order.status] || { label: order.status, color: "bg-muted text-muted-foreground" };
  const itemsSummary = (order.items || [])
    .slice(0, 3)
    .map((i) => `${i.quantity}× ${i.product_name}`)
    .join(", ");
  const moreCount = (order.items || []).length - 3;

  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-xl border bg-card p-4 text-left transition-colors hover:bg-secondary/50 ${
        isActive ? "border-primary/30 shadow-sm" : ""
      }`}
    >
      {/* Restaurant logo */}
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-muted overflow-hidden">
        {order.restaurant?.logo_url ? (
          <img src={order.restaurant.logo_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <ShoppingBag className="h-5 w-5 text-muted-foreground" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-card-foreground truncate">
            {order.restaurant?.name || `Commande #${String(order.order_number).padStart(3, "0")}`}
          </span>
          <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${status.color}`}>
            {status.label}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground truncate">
          {itemsSummary}{moreCount > 0 ? ` +${moreCount}` : ""}
        </p>
        <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
          <Clock className="h-3 w-3" />
          <span>{formatDate(order.created_at)} à {formatTime(order.created_at)}</span>
          <span>•</span>
          <span>{ORDER_TYPE_LABELS[order.order_type] || order.order_type}</span>
          <span>•</span>
          <span className="font-semibold text-foreground">{Number(order.total).toFixed(2)} €</span>
        </div>
      </div>

      <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
    </button>
  );
};

export default MyOrders;
