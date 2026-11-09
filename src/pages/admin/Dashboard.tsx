import ServiceCallsPanel from "@/components/admin/ServiceCallsPanel";
import { Clock, ShoppingBag, Loader2, AlertTriangle, Trash2, XCircle, User, Phone, MapPin, Eye, Printer, CalendarDays, UtensilsCrossed, RefreshCw } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchOrdersWithItems, updateOrderStatus, cancelOrder, deleteOrdersByIds } from "@/services/orderService";
import { useRealtimeOrders } from "@/hooks/useRealtimeOrders";
import { useAdminNotificationSound } from "@/hooks/useAdminNotificationSound";
import { useAuth } from "@/contexts/useAuth";
import AdminLayout from "@/layouts/AdminLayout";
import { useCallback, useEffect, useState, useRef } from "react";
import { Link } from "react-router-dom";
import OrderItemsDisplay from "@/components/order/OrderItemsDisplay";
import OrderChatWidget from "@/components/chat/OrderChatWidget";
import DeliveryPauseControl from "@/components/admin/DeliveryPauseControl";
import { supabase } from "@/integrations/supabase/client";
import { printOrderTicket, getAutoPrintEnabled, setAutoPrintEnabled, type PrintableOrder } from "@/services/printService";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const statusStyle = (status: string) => {
  switch (status) {
    case "pending": return "bg-warning/10 text-warning";
    case "preparing": return "bg-info/10 text-info";
    case "ready": return "bg-success/10 text-success";
    case "waiting_delivery": return "bg-primary/10 text-primary";
    case "in_delivery": return "bg-info/10 text-info";
    default: return "bg-muted text-muted-foreground";
  }
};

const statusLabel = (status: string) => {
  switch (status) {
    case "pending": return "En attente";
    case "preparing": return "En préparation";
    case "ready": return "Prête";
    case "waiting_delivery": return "Attente livreur";
    case "in_delivery": return "En livraison";
    case "delivered": return "Livrée";
    default: return status;
  }
};

type DashboardOrder = Awaited<ReturnType<typeof fetchOrdersWithItems>>[number];
type OrderStatusInput = { orderId: string; status: string; prepMinutes?: number; estimatedDeliveryAt?: string };

/** Live elapsed time component */
const ElapsedTime = ({ since, avgPrepTime }: { since: string; avgPrepTime?: number }) => {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const calc = () => Math.floor((Date.now() - new Date(since).getTime()) / 60000);
    setElapsed(calc());
    const interval = setInterval(() => setElapsed(calc()), 15000);
    return () => clearInterval(interval);
  }, [since]);

  const isOverdue = avgPrepTime ? elapsed > avgPrepTime : false;

  return (
    <span className={`flex items-center gap-1 text-[11px] font-semibold ${isOverdue ? "text-destructive" : "text-muted-foreground"}`}>
      {isOverdue && <AlertTriangle className="h-3 w-3" />}
      <Clock className="h-3 w-3" />
      {elapsed} min
    </span>
  );
};

/** Check if a date is today */
const isToday = (d: Date) => {
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
};

/** Prep time selector before accepting */
const PrepTimeAcceptor = ({ orderId, onAccept, isPending, scheduledAt }: { orderId: string; onAccept: (min: number) => void; isPending: boolean; scheduledAt?: string }) => {
  const [minutes, setMinutes] = useState(20);

  return (
    <div className="mt-3 flex items-center gap-3">
      <div className="flex items-center gap-2 rounded-xl border bg-muted/50 px-3 py-2">
        <button
          onClick={() => setMinutes(Math.max(5, minutes - 5))}
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-background border text-foreground hover:bg-secondary text-base font-bold"
        >
          −
        </button>
        <span className="w-14 text-center text-base font-extrabold text-foreground">{minutes} min</span>
        <button
          onClick={() => setMinutes(Math.min(120, minutes + 5))}
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-background border text-foreground hover:bg-secondary text-base font-bold"
        >
          +
        </button>
      </div>
      <button
        onClick={() => onAccept(minutes)}
        disabled={isPending}
        className="flex-1 rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground disabled:opacity-60"
      >
        ✅ Accepter
      </button>
    </div>
  );
};

/** Date+Time acceptor for future-day scheduled orders */
const FutureDateAcceptor = ({ orderId, scheduledAt, onAccept, isPending }: { orderId: string; scheduledAt: string; onAccept: (isoDate: string) => void; isPending: boolean }) => {
  const scheduled = new Date(scheduledAt);
  const [selectedDate, setSelectedDate] = useState(scheduled.toISOString().slice(0, 10));
  const [selectedHour, setSelectedHour] = useState(scheduled.getHours().toString().padStart(2, "0"));
  const [selectedMinute, setSelectedMinute] = useState((Math.ceil(scheduled.getMinutes() / 15) * 15 % 60).toString().padStart(2, "0"));

  const hours = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, "0"));
  const minutes = ["00", "15", "30", "45"];

  // Build available dates: today + next 6 days
  const dates: { value: string; label: string }[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const val = d.toISOString().slice(0, 10);
    const label = i === 0 ? "Aujourd'hui" : i === 1 ? "Demain" : d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
    dates.push({ value: val, label });
  }

  const handleAccept = () => {
    const dt = new Date(`${selectedDate}T${selectedHour}:${selectedMinute}:00`);
    onAccept(dt.toISOString());
  };

  return (
    <div className="mt-3 space-y-2">
      <p className="text-xs font-bold text-muted-foreground">📅 Commande prête le :</p>
      <div className="flex flex-wrap gap-2">
        <select value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="rounded-lg border bg-background px-2 py-2 text-sm font-bold text-foreground">
          {dates.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
        </select>
        <select value={selectedHour} onChange={(e) => setSelectedHour(e.target.value)} className="rounded-lg border bg-background px-2 py-2 text-sm font-bold text-foreground w-16">
          {hours.map((h) => <option key={h} value={h}>{h}h</option>)}
        </select>
        <select value={selectedMinute} onChange={(e) => setSelectedMinute(e.target.value)} className="rounded-lg border bg-background px-2 py-2 text-sm font-bold text-foreground w-16">
          {minutes.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>
      <button
        onClick={handleAccept}
        disabled={isPending}
        className="w-full rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground disabled:opacity-60"
      >
        ✅ Accepter
      </button>
    </div>
  );
};

/** Single order card — extracted for reuse in ASAP / Scheduled sections */
const OrderCard = ({ order, mutation, cancelMutation, onPrint, restaurantSlug }: {
  order: DashboardOrder;
  mutation: { mutate: (value: OrderStatusInput) => void; isPending: boolean };
  cancelMutation: { mutate: (orderId: string) => void; isPending: boolean };
  onPrint: (order: DashboardOrder) => void;
  restaurantSlug?: string;
}) => {
  const { user } = useAuth();
  const adminUserId = user?.id ?? "";

  return (
    <div
      className={`rounded-2xl border-2 bg-card p-4 shadow-lg ${
        order.status === "pending" ? "border-warning/50 ring-2 ring-warning/20 animate-pulse" : "border-border"
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-base font-extrabold text-primary-foreground shadow-md">
            {order.order_number}
          </span>
          <div>
            <p className="text-base font-extrabold text-foreground">
              Commande #{String(order.order_number).padStart(3, "0")}
            </p>
            <p className="text-sm font-bold text-muted-foreground">
              {order.order_type === "takeaway" ? "À emporter" : order.order_type === "dine_in" ? "Sur place" : "Livraison"}
              {order.table_number && (
                <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">
                  TABLE {order.table_number}
                </span>
              )}
              {order.order_source === "qr" && <span className="ml-2 text-xs font-semibold text-muted-foreground">QR</span>}
              {order.order_source === "server" && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">Saisie serveur</span>}
              {order.order_source === "phone" && <span className="ml-2 text-xs font-semibold text-muted-foreground">Téléphone</span>}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <span className={`rounded-full px-3 py-1 text-xs font-extrabold ${statusStyle(order.status)}`}>
            {statusLabel(order.status)}
          </span>
          {order.scheduled_at && (
            <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-bold text-primary">
              <CalendarDays className="h-3 w-3" />
              {new Date(order.scheduled_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          {order.estimated_delivery_at && ["preparing", "ready", "waiting_delivery", "in_delivery"].includes(order.status) && (() => {
            const eta = new Date(order.estimated_delivery_at);
            const etaSameDay = isToday(eta);
            const etaTime = eta.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
            return (
              <span className="text-xs font-bold text-primary">
                {etaSameDay
                  ? `🕐 Prête vers ${etaTime}`
                  : `📅 ${eta.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} à ${etaTime}`
                }
              </span>
            );
          })()}
          {order.status === "preparing" && order.accepted_at ? (
            <ElapsedTime since={order.accepted_at} avgPrepTime={20} />
          ) : (
            <span className="flex items-center gap-1 text-xs font-semibold text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              {Math.floor((Date.now() - new Date(order.created_at).getTime()) / 60000)} min
            </span>
          )}
        </div>
      </div>

      {/* Price */}
      <div className="rounded-xl bg-muted/40 p-3 mb-3">
        <p className="text-2xl font-black text-foreground">{Number(order.total).toFixed(2)} €</p>
        <span className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${order.payment_status === "paid" ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}>
          {order.payment_status === "paid" ? "✅ Payé" : "⏳ Non payé"}
        </span>
      </div>

      {/* Client info — adapted per order type */}
      {(order.note || order.client_phone || order.delivery_address || order.table_number) && (
        <div className="mb-3 rounded-xl border-2 border-primary/20 bg-primary/5 px-4 py-3 space-y-2.5">
          {/* Name — always shown */}
          {order.note && order.note.includes("Client:") && (
            <p className="flex items-center gap-2 text-base font-extrabold text-foreground">
              <User className="h-5 w-5 text-primary shrink-0" />
              <span>{order.note.split("|")[0].replace("Client:", "").trim()}</span>
            </p>
          )}
          {/* Phone — delivery + takeaway only */}
          {order.client_phone && order.order_type !== "dine_in" && (
            <a href={`tel:${order.client_phone}`} className="flex items-center gap-2 text-base font-bold text-primary hover:underline">
              <Phone className="h-5 w-5 shrink-0" />
              <span className="tracking-wide">{order.client_phone}</span>
            </a>
          )}
          {/* Address — delivery only */}
          {order.delivery_address && order.order_type === "delivery" && (
            <p className="flex items-start gap-2 text-base font-semibold text-foreground">
              <MapPin className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <span className="leading-snug">{order.delivery_address}{order.delivery_postcode ? ` · ${order.delivery_postcode}` : ""}</span>
            </p>
          )}
          {/* Table number — dine_in only */}
          {order.order_type === "dine_in" && order.table_number && (
            <p className="flex items-center gap-2 text-base font-bold text-foreground">
              <UtensilsCrossed className="h-5 w-5 text-primary shrink-0" />
              <span>Table {order.table_number}</span>
            </p>
          )}
          {order.note && order.note.includes("|") && (
            <p className="flex items-start gap-2 text-sm text-muted-foreground italic bg-warning/10 rounded-lg px-3 py-2">
              <span>📝</span>
              <span>{order.note.split("|").slice(1).join("|").trim()}</span>
            </p>
          )}
        </div>
      )}

      {/* Order items */}
      {order.items && order.items.length > 0 && (
        <OrderItemsDisplay items={order.items} large />
      )}

      {/* Detail link + Chat */}
      <div className="mt-3 flex items-center gap-3">
        <Link to={`/admin/orders/${order.id}`} className="flex items-center gap-1.5 text-xs font-bold text-primary hover:underline">
          <Eye className="h-4 w-4" /> Voir détail
        </Link>
        <button onClick={() => onPrint(order)} className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-primary">
          <Printer className="h-4 w-4" /> Imprimer
        </button>
        {adminUserId && (
          <OrderChatWidget orderId={order.id} senderType="restaurant" senderId={adminUserId} inline />
        )}
      </div>

      {/* Action buttons */}
      {order.status === "pending" && (() => {
        const isFutureScheduled = order.scheduled_at && !isToday(new Date(order.scheduled_at));
        if (isFutureScheduled) {
          return (
            <FutureDateAcceptor
              orderId={order.id}
              scheduledAt={order.scheduled_at}
              onAccept={(isoDate) => mutation.mutate({ orderId: order.id, status: "preparing", estimatedDeliveryAt: isoDate })}
              isPending={mutation.isPending}
            />
          );
        }
        return (
          <PrepTimeAcceptor
            orderId={order.id}
            onAccept={(minutes) => mutation.mutate({ orderId: order.id, status: "preparing", prepMinutes: minutes })}
            isPending={mutation.isPending}
          />
        );
      })()}
      {order.status === "preparing" && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button disabled={mutation.isPending} className="mt-3 w-full rounded-xl bg-success py-3.5 text-base font-extrabold text-success-foreground disabled:opacity-60 shadow-md">
              ✅ Marquer prête
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Marquer la commande #{order.order_number} comme prête ?</AlertDialogTitle>
              <AlertDialogDescription>Le client sera notifié que sa commande est prête.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuler</AlertDialogCancel>
              <AlertDialogAction onClick={() => mutation.mutate({ orderId: order.id, status: "ready" })} className="bg-success text-success-foreground hover:bg-success/90">
                Confirmer
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
      {order.status === "ready" && order.order_type === "delivery" && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button disabled={mutation.isPending} className="mt-3 w-full rounded-xl bg-primary py-3.5 text-base font-extrabold text-primary-foreground disabled:opacity-60 shadow-md">
              🚀 Go livraison
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Passer la commande #{order.order_number} en livraison ?</AlertDialogTitle>
              <AlertDialogDescription>La commande sera mise en attente d'un livreur.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuler</AlertDialogCancel>
              <AlertDialogAction onClick={() => mutation.mutate({ orderId: order.id, status: "waiting_delivery" })}>
                Confirmer
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
      {order.status === "ready" && order.order_type !== "delivery" && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button disabled={mutation.isPending} className="mt-3 w-full rounded-xl bg-success py-3.5 text-base font-extrabold text-success-foreground disabled:opacity-60 shadow-md">
              ✅ Récupérée
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Marquer la commande #{order.order_number} comme récupérée ?</AlertDialogTitle>
              <AlertDialogDescription>La commande sera archivée dans le récapitulatif.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuler</AlertDialogCancel>
              <AlertDialogAction onClick={() => mutation.mutate({ orderId: order.id, status: "delivered" })} className="bg-success text-success-foreground hover:bg-success/90">
                Confirmer
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Cancel */}
      <div className="mt-3 flex items-center justify-end">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button className="flex items-center gap-1 rounded-lg bg-destructive/10 px-2.5 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/20">
              <XCircle className="h-3.5 w-3.5" /> Annuler
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Annuler la commande #{order.order_number} ?</AlertDialogTitle>
              <AlertDialogDescription>Cette commande sera marquée comme annulée.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Retour</AlertDialogCancel>
              <AlertDialogAction onClick={() => cancelMutation.mutate(order.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Confirmer l'annulation
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
};

const AdminDashboard = () => {
  const queryClient = useQueryClient();
  const { restaurantId, user, isLoading: isAuthLoading } = useAuth();
  const adminUserId = user?.id ?? "";

  const { data: orders, isLoading, isFetching } = useQuery({
    queryKey: ["admin-orders", restaurantId],
    queryFn: () => fetchOrdersWithItems(restaurantId!),
    enabled: !!restaurantId,
    refetchInterval: 15000,
  });

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-orders", restaurantId] });
  };

  const { data: restaurantInfo } = useQuery({
    queryKey: ["admin-restaurant-info", restaurantId],
    queryFn: async () => {
      const { data } = await supabase.from("restaurants").select("slug, name").eq("id", restaurantId!).single();
      return data ?? null;
    },
    enabled: !!restaurantId,
    staleTime: Infinity,
  });
  const restaurantSlug = restaurantInfo?.slug;
  const restaurantName = restaurantInfo?.name ?? "Restaurant";

  const [autoPrint, setAutoPrint] = useState(getAutoPrintEnabled);

  const handlePrint = useCallback((order: DashboardOrder) => {
    printOrderTicket(order as PrintableOrder, { restaurantName });
  }, [restaurantName]);

  // Auto-print: track seen order IDs to only print new ones
  const seenOrderIds = useRef<Set<string>>(new Set());
  const initialLoadDone = useRef(false);
  useEffect(() => {
    if (!orders) return;
    if (!initialLoadDone.current) {
      // Seed all existing order IDs on first load — don't auto-print them
      orders.forEach((o) => seenOrderIds.current.add(o.id));
      initialLoadDone.current = true;
      return;
    }
    if (!autoPrint) return;
    const pendingOrders = orders.filter((o) => o.status === "pending");
    for (const order of pendingOrders) {
      if (!seenOrderIds.current.has(order.id)) {
        seenOrderIds.current.add(order.id);
        setTimeout(() => handlePrint(order), 500);
      }
    }
  }, [orders, autoPrint, handlePrint]);

  useRealtimeOrders(restaurantId ?? undefined);

  const activeOrders = orders?.filter((order) => ["pending", "preparing", "ready", "waiting_delivery", "in_delivery"].includes(order.status) && order.order_source !== "pos") || [];
  // Scheduled orders stay in "Programmées" only while pending — once accepted they join normal flow
  const scheduledOrders = activeOrders.filter((order) => !!order.scheduled_at && order.status === "pending");
  const asapOrders = activeOrders.filter((o) => !scheduledOrders.includes(o));
  const pendingCount = activeOrders.filter((o) => o.status === "pending").length;
  const readyCount = activeOrders.filter((o) => o.status === "ready").length;
  const todayTotal = activeOrders.reduce((s, o) => s + Number(o.total), 0);

  // Stats
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const todayOrders = orders?.filter((o) => o.created_at >= startOfDay && o.status !== "cancelled") || [];
  const monthOrders = orders?.filter((o) => o.created_at >= startOfMonth && o.status !== "cancelled") || [];
  const revenuToday = todayOrders.reduce((s, o) => s + Number(o.total), 0);
  const revenuMonth = monthOrders.reduce((s, o) => s + Number(o.total), 0);

  // 🔔 Sound notification for pending orders
  useAdminNotificationSound(pendingCount);

  const mutation = useMutation({
    mutationFn: ({ orderId, status, prepMinutes, estimatedDeliveryAt }: { orderId: string; status: string; prepMinutes?: number; estimatedDeliveryAt?: string }) =>
      updateOrderStatus(orderId, status, prepMinutes, estimatedDeliveryAt),
    onMutate: async (variables) => {
      // Optimistically update the cache so completed orders disappear immediately
      await queryClient.cancelQueries({ queryKey: ["admin-orders", restaurantId] });
      const previous = queryClient.getQueryData(["admin-orders", restaurantId]);
      queryClient.setQueryData<DashboardOrder[]>(["admin-orders", restaurantId], (old) => {
        if (!old) return old;
        return old.map((order) => order.id === variables.orderId ? { ...order, status: variables.status } : order);
      });
      return { previous };
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
      if (variables.status === "preparing" && autoPrint) {
        const order = orders?.find((o) => o.id === variables.orderId);
        if (order) {
          setTimeout(() => handlePrint(order), 400);
        }
      }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["admin-orders", restaurantId], context.previous);
      }
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (orderId: string) => cancelOrder(orderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
    },
  });

  const deleteAllMutation = useMutation({
    mutationFn: () => deleteOrdersByIds(activeOrders.map((o) => o.id)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
      queryClient.invalidateQueries({ queryKey: ["recap-orders"] });
    },
  });

  return (
    <AdminLayout>
      <div className="animate-fade-in">
        <div className="p-4"><ServiceCallsPanel /></div>
        {/* Pending alert banner */}
        {pendingCount > 0 && (
          <div className="mx-4 mt-4 flex items-center gap-2 rounded-xl bg-warning/15 px-4 py-3 animate-pulse">
            <span className="text-lg">🔔</span>
            <span className="text-sm font-bold text-warning">
              {pendingCount} commande{pendingCount > 1 ? "s" : ""} en attente !
            </span>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 gap-2 px-4 pt-4 sm:grid-cols-4">
          <div className="rounded-xl bg-card p-3 text-center shadow-card">
            <p className="text-2xl font-extrabold text-foreground">{activeOrders.length}</p>
            <p className="text-[11px] text-muted-foreground">Actives</p>
          </div>
          <div className="rounded-xl bg-card p-3 text-center shadow-card">
            <p className="text-2xl font-extrabold text-success">{readyCount}</p>
            <p className="text-[11px] text-muted-foreground">Prêtes</p>
          </div>
          <div className="rounded-xl bg-card p-3 text-center shadow-card">
            <p className="text-2xl font-extrabold text-primary">{revenuToday.toFixed(2)} €</p>
            <p className="text-[11px] text-muted-foreground">Revenu jour</p>
          </div>
          <div className="rounded-xl bg-card p-3 text-center shadow-card">
            <p className="text-2xl font-extrabold text-foreground">{revenuMonth.toFixed(2)} €</p>
            <p className="text-[11px] text-muted-foreground">Revenu mois</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 px-4 pt-2">
          <div className="rounded-xl bg-card p-3 text-center shadow-card">
            <p className="text-lg font-extrabold text-foreground">{todayOrders.length}</p>
            <p className="text-[11px] text-muted-foreground">Commandes jour</p>
          </div>
          <div className="rounded-xl bg-card p-3 text-center shadow-card">
            <p className="text-lg font-extrabold text-foreground">{monthOrders.length}</p>
            <p className="text-[11px] text-muted-foreground">Commandes mois</p>
          </div>
        </div>

        {/* Delivery pause control */}
        {restaurantId && (
          <div className="mx-4 mt-3">
            <DeliveryPauseControl restaurantId={restaurantId} />
          </div>
        )}

        {/* Auto-print toggle */}
        <div className="mx-4 mt-3 flex items-center justify-between rounded-xl bg-card p-3 shadow-card">
          <div className="flex items-center gap-2">
            <Printer className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold text-foreground">Impression auto</span>
          </div>
          <Switch
            checked={autoPrint}
            onCheckedChange={(v) => { setAutoPrint(v); setAutoPrintEnabled(v); }}
          />
        </div>

        {/* Orders */}
        <div className="px-4 pt-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-foreground">
                Commandes ({activeOrders.length})
              </h2>
              <button
                onClick={handleRefresh}
                disabled={isFetching}
                className="flex items-center gap-1 rounded-lg border border-border px-2 py-1.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`h-3 w-3 ${isFetching ? "animate-spin" : ""}`} />
                {isFetching ? "…" : "Actualiser"}
              </button>
            </div>
            <div className="flex items-center gap-2">
              {activeOrders.filter((order) => order.status === "ready" && order.order_type !== "delivery").length > 0 && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button className="flex items-center gap-1 rounded-lg bg-success/10 px-2.5 py-1.5 text-[11px] font-semibold text-success hover:bg-success/20">
                      ✅ Tout récupérer ({activeOrders.filter((order) => order.status === "ready" && order.order_type !== "delivery").length})
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Marquer toutes les commandes prêtes comme récupérées ?</AlertDialogTitle>
                      <AlertDialogDescription>
                        {activeOrders.filter((order) => order.status === "ready" && order.order_type !== "delivery").length} commande(s) seront marquées comme récupérées et déplacées dans le récap.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Annuler</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => {
                          const readyNonDelivery = activeOrders.filter((order) => order.status === "ready" && order.order_type !== "delivery");
                          readyNonDelivery.forEach((o) => mutation.mutate({ orderId: o.id, status: "delivered" }));
                        }}
                        className="bg-success text-success-foreground hover:bg-success/90"
                      >
                        Tout récupérer
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
              {activeOrders.length > 0 && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button className="flex items-center gap-1 rounded-lg bg-destructive/10 px-2.5 py-1.5 text-[11px] font-semibold text-destructive hover:bg-destructive/20">
                    <Trash2 className="h-3 w-3" /> Tout supprimer ({activeOrders.length})
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Supprimer les {activeOrders.length} commandes actives ?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Seules les commandes affichées sur cette page seront supprimées. Les commandes déjà livrées ou annulées (récap) ne seront pas touchées.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Annuler</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => deleteAllMutation.mutate()}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Supprimer les actives
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            </div>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : activeOrders.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-muted-foreground">
              <ShoppingBag className="mb-3 h-10 w-10" />
              <p className="text-sm">Aucune commande en cours</p>
            </div>
          ) : (
            <>
              {(["dine_in", "takeaway", "delivery"] as const).map((type) => {
                const group = asapOrders.filter((order) => order.order_type === type);
                if (!group.length) return null;
                const title = type === "dine_in" ? "Sur place" : type === "takeaway" ? "À emporter" : "Livraison";
                return <section key={type} className="mb-6"><h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-foreground"><Clock className="h-4 w-4 text-warning"/>{title} · Dès que possible ({group.length})</h3><div className="space-y-3">{group.map(order => <OrderCard key={order.id} order={order} mutation={mutation} cancelMutation={cancelMutation} onPrint={handlePrint} restaurantSlug={restaurantSlug}/>)}</div></section>;
              })}

              {/* Scheduled orders */}
              {scheduledOrders.length > 0 && (
                <div className="mb-6">
                  <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-primary">
                    <CalendarDays className="h-4 w-4" />
                    Programmées ({scheduledOrders.length})
                  </h3>
                  <div className="space-y-3">
                    {scheduledOrders.map((order) => (
                      <OrderCard key={order.id} order={order} mutation={mutation} cancelMutation={cancelMutation} onPrint={handlePrint} restaurantSlug={restaurantSlug} />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </AdminLayout>
  );
};

export default AdminDashboard;
