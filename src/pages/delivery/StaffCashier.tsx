import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Send, Trash2 } from "lucide-react";
import { useDeliveryDriver } from "@/hooks/useDeliveryDriver";
import DeliveryLayout from "@/layouts/DeliveryLayout";
import { fetchRestaurantBySlug } from "@/services/restaurantService";
import { fetchMenuByRestaurantId } from "@/services/menuService";
import { getAvailableServiceTables } from "@/services/tableService";
import ProductModal from "@/components/product/ProductModal";
import { createOrder } from "@/services/orderService";
import { safeToast } from "@/lib/safeToast";
import type { CartItem } from "@/contexts/CartContext";

type CashierProduct = { id: string; name: string; description: string | null; price: number; image_url?: string | null; menu_supplement?: number | null; menu_label?: string | null };

export default function StaffCashier({ embedded = false }: { embedded?: boolean }) {
  const { driver, driverCode, isLoading, loginForm, logout } = useDeliveryDriver();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [table, setTable] = useState("");
  const [product, setProduct] = useState<CashierProduct | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const restaurant = useQuery({ queryKey: ["staff-cashier-restaurant"], queryFn: () => fetchRestaurantBySlug("la-parmigiana") });
  const menu = useQuery({ queryKey: ["staff-cashier-menu", restaurant.data?.id, refresh], queryFn: () => fetchMenuByRestaurantId(restaurant.data!.id), enabled: !!restaurant.data?.id });
  const tables = useQuery({ queryKey: ["staff-cashier-tables"], queryFn: getAvailableServiceTables, enabled: !!driver?.can_serve, refetchInterval: 30000 });
  const total = useMemo(() => cart.reduce((sum, item) => sum + item.unit_price * item.quantity, 0), [cart]);
  const addItem = (item: Omit<CartItem, "id">) => setCart((old) => [...old, { ...item, id: crypto.randomUUID() }]);

  const submit = async () => {
    if (!restaurant.data || !table || cart.length === 0) return;
    setSubmitting(true);
    try {
      const order = await createOrder(restaurant.data.id, cart, "dine_in", { orderSource: "server", requestId: crypto.randomUUID(), tableNumber: Number(table), paymentMethod: "cash", note: `Commande préparée par ${driver?.full_name}` });
      safeToast.success(`Commande #${String(order.order_number).padStart(3, "0")} envoyée à l’admin`);
      setCart([]);
      setTable("");
    } catch (e) { safeToast.error(e instanceof Error ? e.message : "Commande impossible"); }
    finally { setSubmitting(false); }
  };

  if (isLoading) return <DeliveryLayout embedded={embedded}><div className="grid min-h-60 place-items-center"><Loader2 className="animate-spin"/></div></DeliveryLayout>;
  if (!driver) return <DeliveryLayout embedded={embedded}>{loginForm}</DeliveryLayout>;
  if (!driver.can_serve) return <DeliveryLayout embedded={embedded} driverCode={driverCode} onLogout={logout} canDeliver={driver.can_deliver} canServe={driver.can_serve}><div className="p-6">Votre accès caisse serveur est désactivé.</div></DeliveryLayout>;

  return <DeliveryLayout embedded={embedded} driverCode={driverCode} onLogout={logout} canDeliver={driver.can_deliver} canServe={driver.can_serve}><div className="mx-auto max-w-xl space-y-4 p-4 pb-28">
    <div><h1 className="text-xl font-extrabold">Caisse mobile · Sur place</h1><p className="text-sm text-muted-foreground">Même catalogue et options que le menu client. Le serveur recalcule les prix côté serveur.</p></div>
    <label className="block text-sm font-semibold">Table<select value={table} onChange={e => setTable(e.target.value)} className="mt-1 w-full rounded-xl border bg-background p-3"><option value="">Choisir une table</option>{tables.data?.tables.map(n => <option key={n} value={n}>Table {n}</option>)}</select></label>
    {restaurant.isLoading || menu.isLoading ? <div className="py-10 text-center"><Loader2 className="mx-auto animate-spin"/></div> : null}
    {menu.error && <p role="alert" className="text-sm text-destructive">Menu indisponible : {menu.error.message}</p>}
    {menu.data?.map(category => <section key={category.id}><h2 className="sticky top-14 bg-background py-2 text-lg font-bold">{category.name}</h2><div className="space-y-2">{category.products.filter(p => p.is_available).map(p => <button key={p.id} onClick={() => setProduct(p)} className="flex w-full items-center justify-between rounded-xl border bg-card p-3 text-left"><span><b>{p.name}</b>{p.description && <small className="mt-1 block text-muted-foreground">{p.description}</small>}</span><span className="font-bold">{Number(p.price).toFixed(2)} €</span></button>)}</div></section>)}
    {cart.length > 0 && <section className="rounded-2xl border bg-card p-4"><h2 className="font-bold">Ticket · {cart.length} article(s)</h2>{cart.map(item => <div key={item.id} className="flex items-center justify-between border-b py-2 text-sm"><span>{item.quantity} × {item.product_name}<small className="block text-muted-foreground">{item.options.map(o => o.name).join(", ")}</small></span><div className="flex items-center gap-2"><button aria-label="Retirer" onClick={() => setCart(old => old.filter(i => i.id !== item.id))}><Trash2 className="h-4 w-4"/></button><span>{(item.unit_price * item.quantity).toFixed(2)} €</span></div></div>)}<p className="py-3 text-right text-lg font-extrabold">{total.toFixed(2)} €</p><button disabled={!table || submitting} onClick={() => void submit()} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 font-bold text-primary-foreground disabled:opacity-50">{submitting ? <Loader2 className="animate-spin"/> : <Send className="h-4 w-4"/>} Envoyer à la file admin</button></section>}
    {product && restaurant.data && <ProductModal product={product} restaurantId={restaurant.data.id} open onClose={() => setProduct(null)} onSelectItem={addItem}/>}
  </div></DeliveryLayout>;
}

