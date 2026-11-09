import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Check, Loader2 } from "lucide-react";
import { useDeliveryDriver } from "@/hooks/useDeliveryDriver";
import DeliveryLayout from "@/layouts/DeliveryLayout";
import { advanceServiceCall, fetchServiceCalls } from "@/services/tableService";
import { safeToast } from "@/lib/safeToast";
import { fetchTableOrders, markTableOrderServed } from "@/services/deliveryApiService";

export default function StaffService({ embedded = false }: { embedded?: boolean }) {
  const { driver, driverCode, isLoading, loginForm, logout } = useDeliveryDriver();
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ["staff-service-calls", driver?.restaurant_id], queryFn: () => fetchServiceCalls(driver!.restaurant_id), enabled: !!driver?.can_serve, refetchInterval: 5000, refetchIntervalInBackground: true });
  const tableOrders = useQuery({ queryKey: ["staff-table-orders", driver?.id], queryFn: fetchTableOrders, enabled: !!driver?.can_serve, refetchInterval: 10000, refetchIntervalInBackground: true });
  const seen = useRef(new Set<string>());
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
  useEffect(() => { for (const call of query.data || []) if (call.status === "pending" && !seen.current.has(call.id)) { seen.current.add(call.id); if (permission === "granted") new Notification(`Appel · Table ${call.table_number}`, { body: "Un client demande le serveur", tag: `service-${call.id}`, requireInteraction: true }); } }, [query.data, permission]);
  const change = useMutation({ mutationFn: ({ id, status }: { id: string; status: "acknowledged" | "resolved" }) => advanceServiceCall(id, status), onSuccess: () => qc.invalidateQueries({ queryKey: ["staff-service-calls"] }), onError: e => safeToast.error(e.message) });
  const serve = useMutation({ mutationFn: markTableOrderServed, onSuccess: () => { qc.invalidateQueries({ queryKey: ["staff-table-orders"] }); safeToast.success("Commande de table clôturée"); }, onError: e => safeToast.error(e.message) });
  const enable = async () => { if ("Notification" in window) setPermission(await Notification.requestPermission()); };
  if (isLoading) return <DeliveryLayout embedded={embedded}><div className="grid min-h-60 place-items-center"><Loader2 className="animate-spin"/></div></DeliveryLayout>;
  if (!driver) return <DeliveryLayout embedded={embedded}>{loginForm}</DeliveryLayout>;
  if (!driver.can_serve) return <DeliveryLayout embedded={embedded} driverCode={driverCode} onLogout={logout} canDeliver={driver.can_deliver} canServe={driver.can_serve}><div className="p-6">Votre accès serveur est désactivé.</div></DeliveryLayout>;
  return <DeliveryLayout embedded={embedded} driverCode={driverCode} onLogout={logout} canDeliver={driver.can_deliver} canServe={driver.can_serve}><div className="mx-auto max-w-xl space-y-6 p-4"><div className="flex items-center justify-between"><div><h1 className="text-xl font-extrabold">Service en salle</h1><p className="text-sm text-muted-foreground">Appels de table et commandes à servir.</p></div><button onClick={() => void enable()} className="rounded-lg border p-2" title="Activer les notifications"><Bell className="h-5 w-5"/></button></div>
    <section className="space-y-3"><h2 className="font-bold">Appels serveur</h2>{query.isLoading && <Loader2 className="mx-auto animate-spin"/>}{query.error && <p role="alert" className="text-destructive">{query.error.message}</p>}{!query.isLoading && !query.data?.length && <p className="rounded-xl border p-4 text-center text-sm text-muted-foreground">Aucun appel en attente.</p>}{query.data?.map(call => <article key={call.id} className={`rounded-xl border p-4 ${call.status === "pending" ? "border-amber-400 bg-amber-50" : "bg-card"}`}><div className="flex items-center justify-between"><b className="text-lg">Table {call.table_number}</b><span className="text-xs">{call.status === "pending" ? "Appel en attente" : "Pris en charge"}</span></div><p className="mt-1 text-xs text-muted-foreground">{new Date(call.created_at).toLocaleTimeString("fr-BE", { hour: "2-digit", minute: "2-digit" })}</p>{call.status === "acknowledged" && <p className="mt-2 text-xs text-muted-foreground">L’équipe sait qu’un serveur prend cet appel en charge. Le client reste en attente jusqu’à la fin de l’appel.</p>}<button disabled={change.isPending} onClick={() => change.mutate({ id: call.id, status: call.status === "pending" ? "acknowledged" : "resolved" })} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-3 text-sm font-bold text-primary-foreground">{call.status === "pending" ? <><Check className="h-4 w-4"/> Prendre l’appel en charge</> : <>Terminer l’appel</>}</button></article>)}</section>
    <section className="space-y-3"><h2 className="font-bold">Commandes sur place à servir</h2>{tableOrders.data?.map(order => <article key={order.id} className="rounded-xl border bg-card p-4"><div className="flex justify-between"><b>#{String(order.order_number).padStart(3,"0")} · Table {order.table_number}</b><b>{Number(order.total).toFixed(2)} €</b></div><p className="mt-1 text-sm">{order.status === "ready" ? "Prête" : order.status === "preparing" ? "En préparation" : "En attente"}</p>{order.status === "ready" && <button disabled={serve.isPending} onClick={() => serve.mutate(order.id)} className="mt-3 w-full rounded-lg bg-primary py-3 font-bold text-primary-foreground">Marquer servie</button>}</article>)}</section>
  </div></DeliveryLayout>;
}

