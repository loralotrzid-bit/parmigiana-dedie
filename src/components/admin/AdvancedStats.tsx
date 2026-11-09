import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, TrendingUp, Clock, ShoppingBag } from "lucide-react";
import { fetchOrdersWithItems } from "@/services/orderService";
import { startOfDay, endOfDay, subDays, subMonths, startOfMonth, endOfMonth } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

const PRESETS = [
  { value: "today", label: "Aujourd'hui" },
  { value: "7days", label: "7 jours" },
  { value: "30days", label: "30 jours" },
  { value: "custom", label: "📅 Période" },
];

const AdvancedStats = ({ restaurantId }: { restaurantId: string }) => {
  const [preset, setPreset] = useState("today");
  const [customRange, setCustomRange] = useState<{ from?: Date; to?: Date }>({});

  const { data: allOrders } = useQuery({
    queryKey: ["stats-orders", restaurantId],
    queryFn: () => fetchOrdersWithItems(restaurantId),
    enabled: !!restaurantId,
  });

  const dateRange = useMemo(() => {
    const now = new Date();
    switch (preset) {
      case "today": return { start: startOfDay(now), end: endOfDay(now) };
      case "7days": return { start: startOfDay(subDays(now, 7)), end: endOfDay(now) };
      case "30days": return { start: startOfDay(subDays(now, 30)), end: endOfDay(now) };
      case "custom":
        if (customRange.from) {
          return { start: startOfDay(customRange.from), end: endOfDay(customRange.to || customRange.from) };
        }
        return { start: startOfDay(now), end: endOfDay(now) };
      default: return { start: startOfDay(now), end: endOfDay(now) };
    }
  }, [preset, customRange]);

  const filtered = useMemo(() => {
    return (allOrders || []).filter((o) => {
      if (o.status === "cancelled") return false;
      const d = new Date(o.created_at);
      return d >= dateRange.start && d <= dateRange.end;
    });
  }, [allOrders, dateRange]);

  // Most sold products
  const topProducts = useMemo(() => {
    const map = new Map<string, number>();
    filtered.forEach((o) => {
      (o.items || []).forEach((item) => {
        map.set(item.product_name, (map.get(item.product_name) || 0) + item.quantity);
      });
    });
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
  }, [filtered]);

  // Peak hours
  const peakHours = useMemo(() => {
    const hourMap = new Map<number, number>();
    filtered.forEach((o) => {
      const hour = new Date(o.created_at).getHours();
      hourMap.set(hour, (hourMap.get(hour) || 0) + 1);
    });
    return [...hourMap.entries()]
      .sort((a, b) => b[1] - a[1]);
  }, [filtered]);

  const maxHourCount = Math.max(1, ...peakHours.map(([, c]) => c));

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
        {PRESETS.map((p) => (
          <button
            key={p.value}
            onClick={() => setPreset(p.value)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              preset === p.value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {preset === "custom" && (
        <div className="flex gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <button className="rounded-lg border px-3 py-1.5 text-xs font-semibold text-foreground">
                {customRange.from ? format(customRange.from, "dd/MM/yyyy", { locale: fr }) : "Du"}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={customRange.from} onSelect={(d) => setCustomRange(r => ({ ...r, from: d || undefined }))} initialFocus />
            </PopoverContent>
          </Popover>
          <Popover>
            <PopoverTrigger asChild>
              <button className="rounded-lg border px-3 py-1.5 text-xs font-semibold text-foreground">
                {customRange.to ? format(customRange.to, "dd/MM/yyyy", { locale: fr }) : "Au"}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={customRange.to} onSelect={(d) => setCustomRange(r => ({ ...r, to: d || undefined }))} initialFocus />
            </PopoverContent>
          </Popover>
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-card p-3 text-center shadow-card">
          <p className="text-lg font-extrabold text-foreground">{filtered.length}</p>
          <p className="text-[10px] text-muted-foreground">Commandes</p>
        </div>
        <div className="rounded-xl bg-card p-3 text-center shadow-card">
          <p className="text-lg font-extrabold text-primary">{filtered.reduce((s, o) => s + Number(o.total), 0).toFixed(2)} €</p>
          <p className="text-[10px] text-muted-foreground">Revenu</p>
        </div>
        <div className="rounded-xl bg-card p-3 text-center shadow-card">
          <p className="text-lg font-extrabold text-foreground">
            {filtered.length ? (filtered.reduce((s, o) => s + Number(o.total), 0) / filtered.length).toFixed(2) : "0"} €
          </p>
          <p className="text-[10px] text-muted-foreground">Panier moyen</p>
        </div>
      </div>

      {/* Most sold products */}
      <div className="rounded-xl border bg-card p-4 shadow-card">
        <h4 className="flex items-center gap-2 text-sm font-bold text-foreground mb-3">
          <TrendingUp className="h-4 w-4 text-primary" /> Produits les plus vendus
        </h4>
        {topProducts.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">Aucune donnée</p>
        ) : (
          <div className="space-y-2">
            {topProducts.map(([name, qty], i) => (
              <div key={name} className="flex items-center gap-3">
                <span className="w-5 text-xs font-bold text-muted-foreground">{i + 1}.</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{name}</p>
                </div>
                <span className="text-sm font-bold text-primary">{qty}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Peak hours */}
      <div className="rounded-xl border bg-card p-4 shadow-card">
        <h4 className="flex items-center gap-2 text-sm font-bold text-foreground mb-3">
          <Clock className="h-4 w-4 text-primary" /> Heures de pointe
        </h4>
        {peakHours.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">Aucune donnée</p>
        ) : (
          <div className="space-y-1.5">
            {peakHours.slice(0, 8).map(([hour, count]) => (
              <div key={hour} className="flex items-center gap-3">
                <span className="w-8 text-xs font-bold text-muted-foreground">{hour}h</span>
                <div className="flex-1 h-5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary/70 transition-all"
                    style={{ width: `${(count / maxHourCount) * 100}%` }}
                  />
                </div>
                <span className="w-12 text-right text-xs font-bold text-foreground">{count}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdvancedStats;
