import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchOrderById } from "@/services/orderService";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/useAuth";
import AdminLayout from "@/layouts/AdminLayout";
import { Loader2, ArrowLeft, User, Phone, MapPin, Clock, Package, Truck, CheckCircle2, Map } from "lucide-react";
import { lazy, Suspense } from "react";
import OrderChatWidget from "@/components/chat/OrderChatWidget";

const statusLabel = (status: string) => {
  switch (status) {
    case "pending": return "En attente";
    case "preparing": return "En préparation";
    case "ready": return "Prête";
    case "waiting_delivery": return "Attente livreur";
    case "in_delivery": return "En livraison";
    case "picked_up": return "Récupérée";
    case "in_transit": return "En route";
    case "delivered": return "Livrée";
    case "cancelled": return "Annulée";
    default: return status;
  }
};

const statusColor = (status: string) => {
  switch (status) {
    case "pending": return "bg-warning/10 text-warning";
    case "preparing": return "bg-info/10 text-info";
    case "ready": return "bg-success/10 text-success";
    case "waiting_delivery": return "bg-primary/10 text-primary";
    case "in_delivery": case "in_transit": case "picked_up": return "bg-info/10 text-info";
    case "delivered": return "bg-success/10 text-success";
    case "cancelled": return "bg-destructive/10 text-destructive";
    default: return "bg-muted text-muted-foreground";
  }
};

interface TimelineEvent {
  label: string;
  time: string | null;
  icon: typeof Clock;
  done: boolean;
}

const OrderDetail = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const { user } = useAuth();
  const adminUserId = user?.id ?? "";

  const { data: order, isLoading } = useQuery({
    queryKey: ["admin-order-detail", orderId],
    queryFn: () => fetchOrderById(orderId!),
    enabled: !!orderId,
  });

  const { data: assignment } = useQuery({
    queryKey: ["order-assignment", orderId],
    queryFn: async () => {
      const { data } = await supabase
        .from("delivery_assignments")
        .select("*, delivery_drivers(full_name, phone)")
        .eq("order_id", orderId!)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!orderId,
  });

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      </AdminLayout>
    );
  }

  if (!order) {
    return (
      <AdminLayout>
        <div className="flex flex-col items-center py-20 text-muted-foreground">
          <p className="text-sm">Commande introuvable</p>
          <Link to="/admin" className="mt-2 text-xs text-primary hover:underline">Retour</Link>
        </div>
      </AdminLayout>
    );
  }

  const orderTypeLabel = order.order_type === "takeaway" ? "À emporter" : order.order_type === "dine_in" ? "Sur place" : "Livraison";

  // Parse client name from note
  let clientName = "";
  let noteText = order.note || "";
  if (noteText.includes("Client:")) {
    clientName = noteText.split("|")[0].replace("Client:", "").trim();
    noteText = noteText.split("|").slice(1).join("|").trim();
  }

  // Build timeline
  const timeline: TimelineEvent[] = [
    { label: "Commande créée", time: order.created_at, icon: Package, done: true },
    { label: "Acceptée", time: order.accepted_at, icon: CheckCircle2, done: !!order.accepted_at },
    { label: "Prête", time: order.ready_at, icon: CheckCircle2, done: !!order.ready_at },
  ];

  if (order.order_type === "delivery") {
    timeline.push(
      { label: "Livreur assigné", time: assignment?.created_at || null, icon: Truck, done: !!assignment },
      { label: "Récupérée", time: assignment?.picked_up_at || null, icon: Package, done: !!assignment?.picked_up_at },
      { label: "Livrée", time: assignment?.delivered_at || null, icon: CheckCircle2, done: !!assignment?.delivered_at },
    );
  }

  const fmt = (d: string | null) => {
    if (!d) return "—";
    return new Date(d).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };

  const driverInfo = assignment?.delivery_drivers;
  const scheduledAt = order.scheduled_at;

  return (
    <AdminLayout>
      <div className="animate-fade-in px-4 pt-4 pb-20 space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Link to="/admin" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex-1">
            <h1 className="text-lg font-extrabold text-foreground">
              Commande #{String(order.order_number).padStart(3, "0")}
            </h1>
            <p className="text-xs text-muted-foreground">
              {new Date(order.created_at).toLocaleDateString("fr-FR")} · {fmt(order.created_at)}
            </p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${statusColor(order.status)}`}>
            {statusLabel(order.status)}
          </span>
        </div>

        {/* Scheduled banner */}
        {scheduledAt && (
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            <span className="text-sm font-bold text-primary">
              📅 Programmée à {new Date(scheduledAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
              {" — "}
              {new Date(scheduledAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "long" })}
            </span>
          </div>
        )}

        {/* Order info */}
        <div className="rounded-xl border bg-card p-4 shadow-card space-y-3">
          <h2 className="text-sm font-bold text-card-foreground">Informations</h2>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <p className="text-muted-foreground">Mode</p>
              <p className="font-semibold text-foreground">{orderTypeLabel}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Source</p>
              <p className="font-semibold text-foreground">{order.order_source === "qr" ? "QR Code" : "Direct"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Paiement</p>
              <p className="font-semibold text-foreground">{order.payment_method || "Cash"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Statut paiement</p>
              <p className={`font-semibold ${order.payment_status === "paid" ? "text-success" : "text-warning"}`}>
                {order.payment_status === "paid" ? "Payé" : "Non payé"}
              </p>
            </div>
            {order.table_number && (
              <div>
                <p className="text-muted-foreground">Table</p>
                <p className="font-semibold text-foreground">{order.table_number}</p>
              </div>
            )}
          </div>

          {/* Client */}
          {(clientName || order.client_phone || order.delivery_address) && (
            <div className="border-t pt-3 space-y-2">
              {clientName && (
                <p className="flex items-center gap-2 text-sm font-bold text-foreground">
                  <User className="h-4 w-4 text-primary" /> {clientName}
                </p>
              )}
              {order.client_phone && (
                <a href={`tel:${order.client_phone}`} className="flex items-center gap-2 text-sm font-semibold text-primary hover:underline">
                  <Phone className="h-4 w-4" /> {order.client_phone}
                </a>
              )}
              {order.delivery_address && (
                <p className="flex items-start gap-2 text-sm text-foreground">
                  <MapPin className="h-4 w-4 text-primary shrink-0 mt-0.5" /> {order.delivery_address}{order.delivery_postcode ? ` · ${order.delivery_postcode}` : ""}
                </p>
              )}
            </div>
          )}

          {noteText && (
            <div className="border-t pt-2">
              <p className="text-xs text-muted-foreground italic">📝 {noteText}</p>
            </div>
          )}
        </div>

        {/* Products */}
        <div className="rounded-xl border bg-card p-4 shadow-card space-y-3">
          <h2 className="text-sm font-bold text-card-foreground">Produits</h2>
          <div className="space-y-2">
            {order.items?.map((item) => (
              <div key={item.id} className="flex items-start justify-between gap-2 text-sm">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground">{item.quantity}× {item.product_name}</p>
                  {item.choices?.length > 0 && (
                    <div className="ml-4 space-y-0.5">
                      {item.choices.map((c, i) => (
                        <p key={i} className="text-xs text-muted-foreground">
                          └ {c.option_name}
                          {c.price_supplement > 0 && (
                            <span className="ml-1 text-primary">+{Number(c.price_supplement).toFixed(2)} €</span>
                          )}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
                <span className="text-sm font-semibold text-foreground whitespace-nowrap">
                  {Number(item.total_price).toFixed(2)} €
                </span>
              </div>
            ))}
          </div>
          <div className="border-t pt-2 flex justify-between text-sm">
            <span className="font-bold text-foreground">Total</span>
            <span className="font-extrabold text-primary">{Number(order.total).toFixed(2)} €</span>
          </div>
        </div>

        {/* Delivery info */}
        {order.order_type === "delivery" && (
          <div className="rounded-xl border bg-card p-4 shadow-card space-y-3">
            <h2 className="text-sm font-bold text-card-foreground flex items-center gap-2">
              <Truck className="h-4 w-4 text-primary" /> Livraison
            </h2>
            {driverInfo ? (
              <div className="space-y-1 text-sm">
                <p className="font-semibold text-foreground">{driverInfo.full_name}</p>
                {driverInfo.phone && (
                  <a href={`tel:${driverInfo.phone}`} className="text-xs text-primary hover:underline">{driverInfo.phone}</a>
                )}
                <p className="text-xs text-muted-foreground">
                  Statut : <span className="font-semibold">{statusLabel(assignment?.status || "")}</span>
                </p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Aucun livreur assigné</p>
            )}
            {order.delivery_code && (
              <p className="text-xs text-muted-foreground">
                Code livraison : <span className="font-mono font-bold text-foreground">{order.delivery_code}</span>
              </p>
            )}
          </div>
        )}

        {/* Timeline */}
        <div className="rounded-xl border bg-card p-4 shadow-card space-y-3">
          <h2 className="text-sm font-bold text-card-foreground flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" /> Timeline
          </h2>
          <div className="relative ml-3 border-l-2 border-border pl-6 space-y-4">
            {timeline.map((event, idx) => {
              const Icon = event.icon;
              return (
                <div key={idx} className="relative">
                  <div className={`absolute -left-[31px] flex h-5 w-5 items-center justify-center rounded-full ${
                    event.done ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  }`}>
                    <Icon className="h-3 w-3" />
                  </div>
                  <div className="flex items-center justify-between">
                    <p className={`text-sm ${event.done ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                      {event.label}
                    </p>
                    <span className="text-xs text-muted-foreground">{fmt(event.time)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        {/* Chat */}
        {adminUserId && orderId && (
          <div className="rounded-xl border bg-card p-4 shadow-card space-y-3">
            <h2 className="text-sm font-bold text-card-foreground flex items-center gap-2">
              💬 Chat client
            </h2>
            <OrderChatWidget
              orderId={orderId}
              senderType="restaurant"
              senderId={adminUserId}
              inline
            />
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default OrderDetail;
