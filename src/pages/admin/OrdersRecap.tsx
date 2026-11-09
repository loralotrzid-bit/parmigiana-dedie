import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Loader2, Search, Trash2, Pencil, X, Save, Eye, CalendarIcon, Printer } from "lucide-react";
import { printOrderTicket, type PrintableOrder } from "@/services/printService";
import { useAuth } from "@/contexts/useAuth";
import { supabase } from "@/integrations/supabase/client";
import type { TablesUpdate } from "@/integrations/supabase/types";
import { fetchOrdersWithItems } from "@/services/orderService";
import AdminLayout from "@/layouts/AdminLayout";
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subDays, subWeeks, subMonths } from "date-fns";
import { fr } from "date-fns/locale";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { safeToast } from "@/lib/safeToast";
import RecapVatPanel from "@/components/admin/RecapVatPanel";
import RecapExport from "@/components/admin/RecapExport";
import { orderTypeLabel, paymentMethodLabel, type VatRateKey } from "@/lib/vatUtils";

type RecapOrder = Awaited<ReturnType<typeof fetchOrdersWithItems>>[number];
type OrderEditForm = Pick<TablesUpdate<"orders">, "status" | "payment_status" | "payment_method" | "total" | "client_phone" | "delivery_address" | "note">;

const statusLabel = (s: string) => {
  const map: Record<string, string> = {
    pending: "En attente", preparing: "En préparation", ready: "Prête",
    waiting_delivery: "Attente livreur", in_delivery: "En livraison",
    picked_up: "Récupérée", in_transit: "En route", delivered: "Livrée", cancelled: "Annulée",
  };
  return map[s] || s;
};

const statusColor = (s: string) => {
  const map: Record<string, string> = {
    pending: "bg-warning/10 text-warning", preparing: "bg-info/10 text-info",
    ready: "bg-success/10 text-success", waiting_delivery: "bg-primary/10 text-primary",
    in_delivery: "bg-info/10 text-info", delivered: "bg-success/10 text-success",
    cancelled: "bg-destructive/10 text-destructive",
  };
  return map[s] || "bg-muted text-muted-foreground";
};

const OrdersRecap = () => {
  const { restaurantId } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [datePreset, setDatePreset] = useState<string>("all");
  const [customDate, setCustomDate] = useState<Date | undefined>(undefined);
  const [editingOrder, setEditingOrder] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<OrderEditForm>({});
  const [orderTypeFilter, setOrderTypeFilter] = useState<string>("all");
  const [paymentFilter, setPaymentFilter] = useState<string>("all");
  const [vatFilter, setVatFilter] = useState<string>("all");
  const [overrideRate, setOverrideRate] = useState<VatRateKey | null>(null);
  const [showVatPanel, setShowVatPanel] = useState(false);

  const { data: orders, isLoading } = useQuery({
    queryKey: ["recap-orders"],
    queryFn: () => fetchOrdersWithItems(restaurantId!),
    enabled: !!restaurantId,
  });

  const { data: companyInfo } = useQuery({
    queryKey: ["company-info", restaurantId],
    queryFn: async () => {
      const { data } = await supabase.from("restaurants")
        .select("company_name, vat_number, company_address, company_email, company_phone")
        .eq("id", restaurantId!)
        .single();
      return data || {};
    },
    enabled: !!restaurantId,
  });

  const deleteMut = useMutation({
    mutationFn: async (orderId: string) => {
      const { data: items } = await supabase.from("order_items").select("id").eq("order_id", orderId);
      if (items && items.length > 0) {
        const itemIds = items.map(i => i.id);
        await supabase.from("order_item_choices").delete().in("order_item_id", itemIds);
      }
      await supabase.from("order_items").delete().eq("order_id", orderId);
      await supabase.from("delivery_assignments").delete().eq("order_id", orderId);
      await supabase.from("chat_messages").delete().eq("order_id", orderId);
      await supabase.from("admin_alerts").delete().eq("order_id", orderId);
      const { error } = await supabase.from("orders").delete().eq("id", orderId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recap-orders"] });
      queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
      safeToast.success("Commande supprimée");
    },
    onError: (error) => safeToast.error(error.message),
  });

  const updateMut = useMutation({
    mutationFn: async ({ orderId, updates }: { orderId: string; updates: OrderEditForm }) => {
      const { error } = await supabase.from("orders").update(updates).eq("id", orderId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recap-orders"] });
      queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
      setEditingOrder(null);
      safeToast.success("Commande modifiée");
    },
    onError: (error) => safeToast.error(error.message),
  });

  const startEdit = (order: RecapOrder) => {
    setEditingOrder(order.id);
    setEditForm({
      status: order.status,
      note: order.note || "",
      client_phone: order.client_phone || "",
      delivery_address: order.delivery_address || "",
      payment_method: order.payment_method || "cash",
      payment_status: order.payment_status || "unpaid",
      total: order.total,
    });
  };

  const saveEdit = (orderId: string) => {
    updateMut.mutate({ orderId, updates: editForm });
  };

  const dateRange = useMemo(() => {
    const now = new Date();
    if (datePreset === "custom" && customDate) {
      return { start: startOfDay(customDate), end: endOfDay(customDate) };
    }
    switch (datePreset) {
      case "today": return { start: startOfDay(now), end: endOfDay(now) };
      case "yesterday": { const y = subDays(now, 1); return { start: startOfDay(y), end: endOfDay(y) }; }
      case "week": return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) };
      case "last_week": { const lw = subWeeks(now, 1); return { start: startOfWeek(lw, { weekStartsOn: 1 }), end: endOfWeek(lw, { weekStartsOn: 1 }) }; }
      case "month": return { start: startOfMonth(now), end: endOfMonth(now) };
      case "last_month": { const lm = subMonths(now, 1); return { start: startOfMonth(lm), end: endOfMonth(lm) }; }
      default: return null;
    }
  }, [datePreset, customDate]);

  const periodLabel = useMemo(() => {
    if (!dateRange) return "Toutes les dates";
    return `${format(dateRange.start, "dd/MM/yyyy", { locale: fr })} - ${format(dateRange.end, "dd/MM/yyyy", { locale: fr })}`;
  }, [dateRange]);

  const filtered = useMemo(() => {
    const getVatRate = (o: RecapOrder) => {
      const t = o.order_type || "takeaway";
      if (t === "dine_in") return "12";
      return "6";
    };

    return (orders || []).filter((o) => {
      if (statusFilter !== "all" && o.status !== statusFilter) return false;
      if (orderTypeFilter !== "all" && o.order_type !== orderTypeFilter) return false;
      if (paymentFilter !== "all" && o.payment_method !== paymentFilter) return false;
      if (vatFilter !== "all" && getVatRate(o) !== vatFilter) return false;
      if (dateRange) {
        const orderDate = new Date(o.created_at);
        if (orderDate < dateRange.start || orderDate > dateRange.end) return false;
      }
      if (search) {
        const q = search.toLowerCase();
        const num = String(o.order_number).padStart(3, "0");
        const note = (o.note || "").toLowerCase();
        const phone = (o.client_phone || "").toLowerCase();
        const addr = (o.delivery_address || "").toLowerCase();
        if (!num.includes(q) && !note.includes(q) && !phone.includes(q) && !addr.includes(q)) return false;
      }
      return true;
    });
  }, [orders, statusFilter, orderTypeFilter, paymentFilter, vatFilter, dateRange, search]);

  /* ---------- computed stats ---------- */
  const stats = useMemo(() => {
    const total = filtered.reduce((s, o) => s + Number(o.total), 0);
    const cashTotal = filtered.filter((o) => o.payment_method === "cash").reduce((s, o) => s + Number(o.total), 0);
    const cashCount = filtered.filter((o) => o.payment_method === "cash").length;
    const cardTotal = filtered.filter((o) => o.payment_method === "card_delivery").reduce((s, o) => s + Number(o.total), 0);
    const cardCount = filtered.filter((o) => o.payment_method === "card_delivery").length;
    return { total, cashTotal, cashCount, cardTotal, cardCount, count: filtered.length };
  }, [filtered]);

  const statuses = ["all", "pending", "preparing", "ready", "waiting_delivery", "in_delivery", "delivered", "cancelled"];

  return (
    <AdminLayout>
      <TooltipProvider delayDuration={300}>
        <div className="animate-fade-in px-4 pt-4 pb-24 space-y-4">
          <h1 className="text-lg font-extrabold text-foreground">📋 Récapitulatif</h1>

          {/* ── Filters: compact dropdowns ── */}
          <div className="space-y-2">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="N°, tél, adresse…"
                className="w-full rounded-xl border border-input bg-card pl-10 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            {/* Row 1: Période + Statut */}
            <div className="flex gap-2">
              <Select value={datePreset} onValueChange={(v) => { setDatePreset(v); if (v !== "custom") setCustomDate(undefined); }}>
                <SelectTrigger className="flex-1 h-9 text-xs">
                  <CalendarIcon className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                  <SelectValue placeholder="Période" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes les dates</SelectItem>
                  <SelectItem value="today">Aujourd'hui</SelectItem>
                  <SelectItem value="yesterday">Hier</SelectItem>
                  <SelectItem value="week">Cette semaine</SelectItem>
                  <SelectItem value="last_week">Sem. dernière</SelectItem>
                  <SelectItem value="month">Ce mois</SelectItem>
                  <SelectItem value="last_month">Mois dernier</SelectItem>
                </SelectContent>
              </Select>

              <Popover>
                <PopoverTrigger asChild>
                  <button className={cn(
                    "shrink-0 h-9 rounded-md border border-input px-3 text-xs font-medium flex items-center gap-1.5 transition-colors",
                    datePreset === "custom" ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground hover:bg-accent"
                  )}>
                    📅 {datePreset === "custom" && customDate ? format(customDate, "dd/MM", { locale: fr }) : "Date"}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={customDate}
                    onSelect={(d) => { setCustomDate(d); setDatePreset("custom"); }}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="flex-1 h-9 text-xs">
                  <SelectValue placeholder="Statut" />
                </SelectTrigger>
                <SelectContent>
                  {statuses.map(s => (
                    <SelectItem key={s} value={s}>{s === "all" ? "Tous les statuts" : statusLabel(s)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Row 2: Type + Paiement + TVA */}
            <div className="flex gap-2">
              <Select value={orderTypeFilter} onValueChange={setOrderTypeFilter}>
                <SelectTrigger className="flex-1 h-9 text-xs">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous types</SelectItem>
                  <SelectItem value="dine_in">Sur place</SelectItem>
                  <SelectItem value="takeaway">À emporter</SelectItem>
                  <SelectItem value="delivery">Livraison</SelectItem>
                </SelectContent>
              </Select>

              <Select value={paymentFilter} onValueChange={setPaymentFilter}>
                <SelectTrigger className="flex-1 h-9 text-xs">
                  <SelectValue placeholder="Paiement" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous paiements</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="card_delivery">Carte</SelectItem>
                  <SelectItem value="wero">Wero</SelectItem>
                </SelectContent>
              </Select>

              <Select value={vatFilter} onValueChange={setVatFilter}>
                <SelectTrigger className="flex-1 h-9 text-xs">
                  <SelectValue placeholder="TVA" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes TVA</SelectItem>
                  <SelectItem value="6">6%</SelectItem>
                  <SelectItem value="12">12%</SelectItem>
                  <SelectItem value="21">21%</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* ── Stat cards ── */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-xl border border-border bg-card p-3 space-y-0.5">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Total</p>
              <p className="text-xl font-black text-primary">{stats.total.toFixed(2)} €</p>
              <p className="text-[10px] text-muted-foreground">{stats.count} commande{stats.count > 1 ? "s" : ""}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-3 space-y-0.5">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">💵 Cash</p>
              <p className="text-xl font-black text-foreground">{stats.cashTotal.toFixed(2)} €</p>
              <p className="text-[10px] text-muted-foreground">{stats.cashCount} cmd</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-3 space-y-0.5">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">💳 Carte</p>
              <p className="text-xl font-black text-foreground">{stats.cardTotal.toFixed(2)} €</p>
              <p className="text-[10px] text-muted-foreground">{stats.cardCount} cmd</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-3 space-y-0.5">
              <button
                onClick={() => setShowVatPanel(!showVatPanel)}
                className="w-full text-left"
              >
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">🧾 TVA & Export</p>
                <p className="text-sm font-bold text-primary">{showVatPanel ? "Masquer ▲" : "Afficher ▼"}</p>
              </button>
            </div>
          </div>

          {/* ── VAT panel (collapsible) ── */}
          {showVatPanel && (
            <div className="space-y-3">
              <div className="flex gap-1.5 items-center overflow-x-auto no-scrollbar">
                <span className="text-[10px] font-bold text-muted-foreground shrink-0">Export TVA :</span>
                {([
                  { value: null, label: "Auto" },
                  { value: "6" as VatRateKey, label: "6%" },
                  { value: "12" as VatRateKey, label: "12%" },
                  { value: "21" as VatRateKey, label: "21%" },
                ] as const).map((opt) => (
                  <button
                    key={String(opt.value)}
                    onClick={() => setOverrideRate(opt.value)}
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                      overrideRate === opt.value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <RecapVatPanel orders={filtered} overrideRate={overrideRate} />
              <RecapExport orders={filtered} overrideRate={overrideRate} companyInfo={companyInfo || {}} periodLabel={periodLabel} />
            </div>
          )}

          {/* ── Order list ── */}
          {isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-12">Aucune commande trouvée</p>
          ) : (
            <div className="space-y-2">
              {filtered.map((order) => {
                const isEditing = editingOrder === order.id;
                const num = String(order.order_number).padStart(3, "0");
                const date = new Date(order.created_at);
                const time = date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
                const dateStr = date.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });

                let clientName = "";
                if (order.note?.includes("Client:")) {
                  clientName = order.note.split("|")[0].replace("Client:", "").trim();
                }

                return (
                  <div key={order.id} className="rounded-xl border border-border bg-card shadow-card overflow-hidden">
                    {/* Header */}
                    <div className="flex items-center justify-between gap-2 px-3 py-2.5">
                      <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                        <span className="text-sm font-black text-foreground">#{num}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${statusColor(order.status)}`}>
                          {statusLabel(order.status)}
                        </span>
                        {order.order_type && (
                          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                            {orderTypeLabel(order.order_type)}
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-muted-foreground shrink-0">{dateStr} {time}</span>
                    </div>

                    {/* Body: compact */}
                    <div className="px-3 pb-2 space-y-1">
                      <div className="flex items-center justify-between">
                        <div className="min-w-0 text-xs text-muted-foreground">
                          {clientName && <span className="font-bold text-foreground mr-2">{clientName}</span>}
                          {order.client_phone && <span>{order.client_phone}</span>}
                          {order.delivery_address && <p className="truncate">📍 {order.delivery_address}{order.delivery_postcode ? ` · ${order.delivery_postcode}` : ""}</p>}
                        </div>
                        <p className="text-base font-black text-primary shrink-0 ml-2">{Number(order.total).toFixed(2)} €</p>
                      </div>

                      {order.items && order.items.length > 0 && (
                        <p className="text-[11px] text-muted-foreground truncate">
                          {order.items.map((item) => `${item.quantity}× ${item.product_name}`).join(", ")}
                        </p>
                      )}

                      {/* Edit form (unchanged logic) */}
                      {isEditing && (
                        <div className="mt-2 space-y-2 rounded-xl bg-muted/30 p-3 border border-border/50">
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-[10px] font-semibold text-muted-foreground">Statut</label>
                              <select value={editForm.status ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value }))} className="w-full rounded-lg border border-input bg-card px-2 py-1.5 text-xs text-foreground">
                                {statuses.filter(s => s !== "all").map(s => (<option key={s} value={s}>{statusLabel(s)}</option>))}
                              </select>
                            </div>
                            <div>
                              <label className="text-[10px] font-semibold text-muted-foreground">Paiement</label>
                              <select value={editForm.payment_status ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, payment_status: e.target.value }))} className="w-full rounded-lg border border-input bg-card px-2 py-1.5 text-xs text-foreground">
                                <option value="unpaid">Non payé</option>
                                <option value="paid">Payé</option>
                              </select>
                            </div>
                            <div>
                              <label className="text-[10px] font-semibold text-muted-foreground">Méthode</label>
                              <select value={editForm.payment_method ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, payment_method: e.target.value }))} className="w-full rounded-lg border border-input bg-card px-2 py-1.5 text-xs text-foreground">
                                <option value="cash">Cash</option>
                                <option value="card_delivery">CB livraison</option>
                                <option value="wero">Wero</option>
                              </select>
                            </div>
                            <div>
                              <label className="text-[10px] font-semibold text-muted-foreground">Total (€)</label>
                              <input type="number" step="0.01" value={editForm.total ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, total: parseFloat(e.target.value) || 0 }))} className="w-full rounded-lg border border-input bg-card px-2 py-1.5 text-xs text-foreground" />
                            </div>
                          </div>
                          <div>
                            <label className="text-[10px] font-semibold text-muted-foreground">Téléphone</label>
                            <input value={editForm.client_phone ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, client_phone: e.target.value }))} className="w-full rounded-lg border border-input bg-card px-2 py-1.5 text-xs text-foreground" />
                          </div>
                          <div>
                            <label className="text-[10px] font-semibold text-muted-foreground">Adresse</label>
                            <input value={editForm.delivery_address ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, delivery_address: e.target.value }))} className="w-full rounded-lg border border-input bg-card px-2 py-1.5 text-xs text-foreground" />
                          </div>
                          <div>
                            <label className="text-[10px] font-semibold text-muted-foreground">Note</label>
                            <textarea value={editForm.note ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, note: e.target.value }))} className="w-full rounded-lg border border-input bg-card px-2 py-1.5 text-xs text-foreground resize-none" rows={2} />
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => saveEdit(order.id)} disabled={updateMut.isPending} className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-primary py-2 text-xs font-bold text-primary-foreground">
                              <Save className="h-3.5 w-3.5" /> Enregistrer
                            </button>
                            <button onClick={() => setEditingOrder(null)} className="rounded-xl bg-muted px-4 py-2 text-xs font-semibold text-muted-foreground">Annuler</button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Actions: icon-only with tooltips */}
                    <div className="flex items-center border-t border-border/50 divide-x divide-border/50">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Link to={`/admin/orders/${order.id}`} className="flex-1 flex items-center justify-center py-2.5 text-primary hover:bg-primary/5 transition-colors">
                            <Eye className="h-4 w-4" />
                          </Link>
                        </TooltipTrigger>
                        <TooltipContent side="bottom"><p className="text-xs">Détail</p></TooltipContent>
                      </Tooltip>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => {
                              const printable: PrintableOrder = {
                                order_number: order.order_number,
                                created_at: order.created_at,
                                order_type: order.order_type,
                                table_number: order.table_number,
                                note: order.note,
                                client_phone: order.client_phone,
                                delivery_address: order.delivery_address,
                                total: order.total,
                                payment_status: order.payment_status,
                                payment_method: order.payment_method,
                                items: (order.items || []).map((i) => ({
                                  product_name: i.product_name,
                                  quantity: i.quantity,
                                  unit_price: i.unit_price,
                                  total_price: i.total_price,
                                  choices: (i.choices || []).map((c) => ({ option_name: c.option_name, price_supplement: c.price_supplement })),
                                })),
                              };
                              printOrderTicket(printable);
                            }}
                            className="flex-1 flex items-center justify-center py-2.5 text-foreground hover:bg-muted/50 transition-colors"
                          >
                            <Printer className="h-4 w-4" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom"><p className="text-xs">Imprimer</p></TooltipContent>
                      </Tooltip>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => isEditing ? setEditingOrder(null) : startEdit(order)}
                            className="flex-1 flex items-center justify-center py-2.5 text-foreground hover:bg-muted/50 transition-colors"
                          >
                            {isEditing ? <X className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom"><p className="text-xs">{isEditing ? "Fermer" : "Modifier"}</p></TooltipContent>
                      </Tooltip>

                      <AlertDialog>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <AlertDialogTrigger asChild>
                              <button className="flex-1 flex items-center justify-center py-2.5 text-destructive hover:bg-destructive/5 transition-colors">
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </AlertDialogTrigger>
                          </TooltipTrigger>
                          <TooltipContent side="bottom"><p className="text-xs">Supprimer</p></TooltipContent>
                        </Tooltip>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Supprimer la commande #{num} ?</AlertDialogTitle>
                            <AlertDialogDescription>Cette action est irréversible.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Annuler</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteMut.mutate(order.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Supprimer</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </TooltipProvider>
    </AdminLayout>
  );
};

export default OrdersRecap;
