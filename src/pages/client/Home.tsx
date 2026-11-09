import { Search, Check, SlidersHorizontal, UtensilsCrossed, ShoppingBag, Truck, Leaf } from "lucide-react";
import { isOpenNow } from "@/lib/isOpenNow";
import { useQuery } from "@tanstack/react-query";
import { fetchRestaurants } from "@/services/restaurantService";
import { RestaurantListSkeleton } from "@/components/restaurant/RestaurantCardSkeleton";
import RestaurantCard from "@/components/restaurant/RestaurantCard";
import ClientLayout from "@/layouts/ClientLayout";
import { useState, useMemo, useCallback, useEffect } from "react";
import { optimizedUrl } from "@/hooks/useImagePrefetch";
import { Switch } from "@/components/ui/switch";
import AddressButton from "@/components/client/AddressButton";
import { persistGet } from "@/lib/persistCache";
import type { Tables } from "@/integrations/supabase/types";

// ── Types ──────────────────────────────────────────────────────────
type SortOption = "relevance" | "distance" | "top_month" | "price" | "fastest";
type BudgetOption = "all" | "10" | "15" | "20" | "25" | "30";
type OrderModeFilter = "all" | "delivery" | "takeaway" | "dine_in";

type Restaurant = Tables<"restaurants">;

// ── Constants ──────────────────────────────────────────────────────
const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "relevance", label: "Pertinence" },
  { value: "distance", label: "Distance" },
  { value: "top_month", label: "Meilleurs du mois" },
  { value: "price", label: "Prix" },
  { value: "fastest", label: "Plus rapide" },
];

const BUDGET_OPTIONS: { value: BudgetOption; label: string }[] = [
  { value: "all", label: "Voir tout" },
  { value: "10", label: "€ 10 ou moins" },
  { value: "15", label: "€ 15 ou moins" },
  { value: "20", label: "€ 20 ou moins" },
  { value: "25", label: "€ 25 ou moins" },
  { value: "30", label: "€ 30 ou moins" },
];

const VISIBLE_CATEGORIES: { name: string; emoji: string; bg: string }[] = [
  { name: "Pizza", emoji: "🍕", bg: "bg-orange-100" },
  { name: "Pita / Kebab", emoji: "🥙", bg: "bg-amber-100" },
  { name: "Pâtes", emoji: "🍝", bg: "bg-yellow-100" },
  { name: "Burgers", emoji: "🍔", bg: "bg-red-100" },
  { name: "Sushi", emoji: "🍣", bg: "bg-pink-100" },
  { name: "Chinois", emoji: "🥡", bg: "bg-emerald-100" },
  { name: "Poke bowl", emoji: "🥗", bg: "bg-teal-100" },
];

const ALL_EXTRA_CATEGORIES: { name: string; emoji: string; bg: string }[] = [
  { name: "Frites", emoji: "🍟", bg: "bg-yellow-100" },
  { name: "Africain", emoji: "🍛", bg: "bg-orange-100" },
  { name: "Américain", emoji: "🌭", bg: "bg-red-100" },
  { name: "Asiatique", emoji: "🍜", bg: "bg-amber-100" },
  { name: "Autre", emoji: "🍽️", bg: "bg-gray-100" },
  { name: "Boissons / Snacks", emoji: "🥤", bg: "bg-blue-100" },
  { name: "Bubble Tea", emoji: "🧋", bg: "bg-purple-100" },
  { name: "Coréen", emoji: "🍚", bg: "bg-rose-100" },
  { name: "Crêpes", emoji: "🥞", bg: "bg-amber-100" },
  { name: "Curry", emoji: "🍛", bg: "bg-orange-100" },
  { name: "Falafel", emoji: "🧆", bg: "bg-lime-100" },
  { name: "Grec", emoji: "🫓", bg: "bg-sky-100" },
  { name: "Grill", emoji: "🥩", bg: "bg-red-100" },
  { name: "Gyros", emoji: "🌯", bg: "bg-yellow-100" },
  { name: "Indien", emoji: "🫕", bg: "bg-orange-100" },
  { name: "Italien", emoji: "🇮🇹", bg: "bg-green-100" },
  { name: "Japonais", emoji: "🍱", bg: "bg-rose-100" },
  { name: "Libanais", emoji: "🧆", bg: "bg-amber-100" },
  { name: "Lunch", emoji: "🥪", bg: "bg-yellow-100" },
  { name: "Marocain", emoji: "🫕", bg: "bg-orange-100" },
  { name: "Mexicain", emoji: "🌮", bg: "bg-red-100" },
  { name: "Nouilles", emoji: "🍜", bg: "bg-amber-100" },
  { name: "Pause sucrée", emoji: "🧁", bg: "bg-pink-100" },
  { name: "Petit déjeuner", emoji: "🥐", bg: "bg-yellow-100" },
  { name: "Pizza Américaine", emoji: "🍕", bg: "bg-orange-100" },
  { name: "Pizza Turque", emoji: "🫓", bg: "bg-amber-100" },
  { name: "Poisson et Fruits de mer", emoji: "🐟", bg: "bg-blue-100" },
  { name: "Poulet", emoji: "🍗", bg: "bg-yellow-100" },
  { name: "Salades", emoji: "🥗", bg: "bg-green-100" },
  { name: "Sandwiches", emoji: "🥖", bg: "bg-amber-100" },
  { name: "Smoothies / Jus", emoji: "🥤", bg: "bg-green-100" },
  { name: "Snacks", emoji: "🍿", bg: "bg-yellow-100" },
  { name: "Soupes", emoji: "🍲", bg: "bg-orange-100" },
  { name: "Steak", emoji: "🥩", bg: "bg-red-100" },
  { name: "Tacos", emoji: "🌮", bg: "bg-yellow-100" },
  { name: "Tacos Français", emoji: "🌯", bg: "bg-orange-100" },
  { name: "Tandoori", emoji: "🍗", bg: "bg-red-100" },
  { name: "Thaïlandais", emoji: "🍜", bg: "bg-green-100" },
  { name: "Turc", emoji: "🇹🇷", bg: "bg-red-100" },
  { name: "Wok", emoji: "🥘", bg: "bg-orange-100" },
  { name: "Wraps", emoji: "🌯", bg: "bg-lime-100" },
];

// ── Component ──────────────────────────────────────────────────────
const Home = () => {

  // OAuth redirect is now handled globally in AuthRedirectHandler
  const [openOnly, setOpenOnly] = useState(false);
  const [freeDelivery, setFreeDelivery] = useState(false);
  const [topRated, setTopRated] = useState(false);
  const [budget, setBudget] = useState<BudgetOption>("all");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("relevance");
  const [showSort, setShowSort] = useState(false);
  const [category, setCategory] = useState<string | null>(null);
  const [filterHalal, setFilterHalal] = useState(false);
  const [filterMix, setFilterMix] = useState(false);
  const [showBudgetDrawer, setShowBudgetDrawer] = useState(false);
  const [orderMode, setOrderMode] = useState<OrderModeFilter>("all");

  // Seed React Query with localStorage data for instant first render (Uber Eats pattern)
  const persistedRestaurants = useMemo(() => persistGet<Partial<Restaurant>[]>("restaurants"), []);

  const {
    data: restaurants,
    isLoading,
    isFetching,
    isError,
    error,
  } = useQuery({
    queryKey: ["restaurants"],
    queryFn: fetchRestaurants,
    initialData: persistedRestaurants && persistedRestaurants.length > 0 ? persistedRestaurants : undefined,
    placeholderData: (prev) => prev,
    staleTime: 120_000,
    gcTime: 600_000,
    retry: 1,
    retryDelay: (attempt) => Math.min(500 * (attempt + 1), 2000),
    refetchOnMount: "always", // Always refresh in background even with initialData
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
  });

  // Show skeleton ONLY on first load when no cached data exists.
  const showLoadingState = isLoading && !restaurants;

  // Preload first 6 restaurant images for instant above-the-fold render
  useEffect(() => {
    if (!restaurants || restaurants.length === 0) return;
    restaurants.slice(0, 6).forEach((r) => {
      const url = r.image_url || r.logo_url;
      if (!url) return;
      const img = new Image();
      img.src = optimizedUrl(url, 400, 70) || url;
    });
  }, [restaurants]);

  const filtered = useMemo(() => {
    if (!restaurants) return [];
    return restaurants
      .filter((r) => {
        const q = search.toLowerCase();
        const reallyOpen = isOpenNow(r.opening_hours, r.is_open);
        const matchSearch = !q || r.name.toLowerCase().includes(q) || r.description?.toLowerCase().includes(q);
        const matchOpen = !openOnly || reallyOpen;
        const matchFreeDelivery = !freeDelivery || r.is_free_delivery;
        const matchTopRated = !topRated || r.is_top_rated;
        const matchBudget = budget === "all" || (r.minimum_order ?? 0) <= Number(budget);
        const matchCategory = !category || r.cuisine_categories?.includes(category) || r.cuisine_type === category;
        let matchHalal = true;
        if (filterHalal && !filterMix) matchHalal = r.halal_type === "yes";
        else if (!filterHalal && filterMix) matchHalal = r.halal_type === "mixed";
        else if (filterHalal && filterMix) matchHalal = r.halal_type === "yes" || r.halal_type === "mixed";
        const matchMode =
          orderMode === "all" ||
          (orderMode === "delivery" && r.delivery_mode !== "disabled") ||
          (orderMode === "takeaway") || // all restaurants support takeaway
          (orderMode === "dine_in" && r.dine_in_enabled === true);
        return matchSearch && matchOpen && matchFreeDelivery && matchTopRated && matchBudget && matchCategory && matchHalal && matchMode;
      })
      .sort((a, b) => {
        switch (sortBy) {
          case "top_month":
          case "relevance":
            return (b.rating ?? 0) - (a.rating ?? 0);
          case "price":
            return (a.minimum_order ?? 0) - (b.minimum_order ?? 0);
          case "fastest":
            return (a.avg_prep_time ?? 99) - (b.avg_prep_time ?? 99);
          default:
            return 0;
        }
      });
  }, [restaurants, search, openOnly, freeDelivery, topRated, budget, category, filterHalal, filterMix, sortBy, orderMode]);

  const budgetCounts = useMemo(() => {
    if (!restaurants || showLoadingState) return {};
    const all = restaurants as Restaurant[];
    return {
      all: all.length,
      "10": all.filter((r) => (r.minimum_order ?? 0) <= 10).length,
      "15": all.filter((r) => (r.minimum_order ?? 0) <= 15).length,
      "20": all.filter((r) => (r.minimum_order ?? 0) <= 20).length,
      "25": all.filter((r) => (r.minimum_order ?? 0) <= 25).length,
      "30": all.filter((r) => (r.minimum_order ?? 0) <= 30).length,
    };
  }, [restaurants, showLoadingState]);

  const activeFilterCount = [openOnly, freeDelivery, topRated, budget !== "all", filterHalal, filterMix, orderMode !== "all"].filter(Boolean).length;

  return (
    <ClientLayout>
      <div className="animate-fade-in">
        {/* ── Hero ─────────────────────────────────────────── */}
        <section className="bg-primary px-4 pb-5 pt-5">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-extrabold text-primary-foreground">
              Envie de quoi<br />aujourd'hui ?
            </h1>
            <AddressButton />
          </div>
        </section>

        {/* ── Mobile filter chips (no arrows, direct inline) ─ */}
        <section className="min-[480px]:hidden border-b bg-card px-4 py-2.5">
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
            {/* Order mode chips */}
            <OrderModeChip icon={<UtensilsCrossed className="h-3 w-3" />} label="Tout" active={orderMode === "all"} onToggle={() => setOrderMode("all")} />
            <OrderModeChip icon={<Truck className="h-3 w-3" />} label="Livraison" active={orderMode === "delivery"} onToggle={() => setOrderMode("delivery")} />
            <OrderModeChip icon={<ShoppingBag className="h-3 w-3" />} label="Emporter" active={orderMode === "takeaway"} onToggle={() => setOrderMode("takeaway")} />
            <OrderModeChip icon={<UtensilsCrossed className="h-3 w-3" />} label="Sur place" active={orderMode === "dine_in"} onToggle={() => setOrderMode("dine_in")} />
            <div className="w-px h-5 bg-border shrink-0" />
            <FilterChip label="Ouvert" active={openOnly} onToggle={() => setOpenOnly(!openOnly)} />
            <FilterChip label="Les meilleurs" active={topRated} onToggle={() => setTopRated(!topRated)} />
            <FilterChip label="Livraison gratuite" active={freeDelivery} onToggle={() => setFreeDelivery(!freeDelivery)} />
            <FilterChip
              label={budget !== "all" ? `≤ ${budget}€` : "Budget"}
              active={budget !== "all"}
              onToggle={() => setShowBudgetDrawer(!showBudgetDrawer)}
            />
            <button
              onClick={() => setShowBudgetDrawer(!showBudgetDrawer)}
              className={`shrink-0 flex items-center justify-center h-8 w-8 rounded-full border transition-colors ${
                activeFilterCount > 0
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-foreground hover:border-primary/40"
              }`}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Budget & advanced filters dropdown */}
          {showBudgetDrawer && (
            <div className="mt-2 rounded-xl border bg-background p-3 shadow-elevated space-y-3">
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">Budget max</p>
                <div className="flex flex-wrap gap-1.5">
                  {BUDGET_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => { setBudget(opt.value); }}
                      className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                        budget === opt.value
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-card text-foreground hover:border-primary/40"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-4 border-t pt-3">
                <button
                  onClick={() => setFilterHalal(!filterHalal)}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    filterHalal ? "border-success bg-success/10 text-success" : "border-border text-foreground hover:border-success/40"
                  }`}
                >
                  <Leaf className="h-3.5 w-3.5" /> Halal
                </button>
                <button
                  onClick={() => setFilterMix(!filterMix)}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    filterMix ? "border-warning bg-warning/10 text-warning" : "border-border text-foreground hover:border-warning/40"
                  }`}
                >
                  <Leaf className="h-3.5 w-3.5" /> Mix
                </button>
              </div>
              <button
                onClick={() => setShowBudgetDrawer(false)}
                className="w-full rounded-lg bg-primary py-2 text-xs font-bold text-primary-foreground"
              >
                Appliquer ({filtered.length} résultats)
              </button>
            </div>
          )}
        </section>

        {/* ── Main layout: sidebar + content ──────────────── */}
        <div className="flex">
          {/* ══════ LEFT SIDEBAR (desktop only) ═══════════════ */}
          <aside className="hidden min-[480px]:block w-52 shrink-0 border-r bg-card">
            <div className="sticky top-14 p-4 space-y-5">
              <p className="text-sm font-bold text-foreground">
                {showLoadingState
                  ? "Chargement…"
                  : `${filtered.length} restaurant${filtered.length > 1 ? "s" : ""}`}
              </p>

              <div>
                <p className="mb-2 text-sm font-bold text-foreground">Mode de commande</p>
                <div className="space-y-1">
                  {([
                    { value: "all" as const, label: "Tous", icon: <UtensilsCrossed className="h-3.5 w-3.5" /> },
                    { value: "delivery" as const, label: "Livraison", icon: <Truck className="h-3.5 w-3.5" /> },
                    { value: "takeaway" as const, label: "Emporter", icon: <ShoppingBag className="h-3.5 w-3.5" /> },
                    { value: "dine_in" as const, label: "Sur place", icon: <UtensilsCrossed className="h-3.5 w-3.5" /> },
                  ]).map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setOrderMode(opt.value)}
                      className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] font-semibold transition-colors ${
                        orderMode === opt.value ? "bg-primary/10 text-primary" : "text-foreground hover:bg-accent"
                      }`}
                    >
                      {opt.icon} {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <SidebarToggle label="Actuellement ouvert" checked={openOnly} onChange={setOpenOnly} />
                <SidebarToggle label="Les meilleurs" checked={topRated} onChange={setTopRated} />
                <SidebarToggle label="Livraison gratuite" checked={freeDelivery} onChange={setFreeDelivery} />
              </div>

              <div>
                <p className="mb-2 text-sm font-bold text-foreground">Minimum par commande</p>
                <div className="space-y-1">
                  {BUDGET_OPTIONS.map((opt) => (
                    <label
                      key={opt.value}
                      className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-foreground hover:bg-accent transition-colors"
                    >
                      <span
                        className={`flex h-4.5 w-4.5 items-center justify-center rounded-full border-2 transition-colors ${
                          budget === opt.value
                            ? "border-primary bg-primary"
                            : "border-muted-foreground/40 bg-background"
                        }`}
                      >
                        {budget === opt.value && (
                          <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />
                        )}
                      </span>
                      <span className="text-[13px]" onClick={() => setBudget(opt.value)}>
                        {opt.label}{" "}
                        <span className="text-muted-foreground">
                          ({showLoadingState ? "…" : budgetCounts[opt.value] ?? 0})
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-2 text-sm font-bold text-foreground">Certification</p>
                <div className="space-y-3">
                  <SidebarToggle
                    label="Halal"
                    checked={filterHalal}
                    onChange={setFilterHalal}
                    icon={<Leaf className="h-3.5 w-3.5 text-success" />}
                  />
                  <SidebarToggle
                    label="Mix"
                    checked={filterMix}
                    onChange={setFilterMix}
                    icon={<Leaf className="h-3.5 w-3.5 text-warning" />}
                  />
                </div>
              </div>
            </div>
          </aside>

          {/* ══════ MAIN CONTENT ═════════════════════════════ */}
          <div className="flex-1 min-w-0">
            {/* ── Search + Sort ────────────────────────────── */}
            <section className="border-b bg-card px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Recherche de restaurant ?"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full rounded-xl border border-border bg-background py-2.5 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
                  />
                </div>
                <div className="relative">
                  <button
                    onClick={() => setShowSort(!showSort)}
                    className="flex shrink-0 items-center gap-2 rounded-xl border border-border bg-background px-3 py-2.5 text-xs font-semibold text-foreground transition-colors hover:border-primary/40"
                  >
                    Trier par
                    <span className="text-primary font-bold">
                      {SORT_OPTIONS.find((o) => o.value === sortBy)?.label}
                    </span>
                  </button>
                  {showSort && (
                    <div className="absolute right-0 top-full z-50 mt-1 w-48 rounded-lg border bg-card p-1 shadow-elevated">
                      {SORT_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => { setSortBy(opt.value); setShowSort(false); }}
                          className="flex w-full items-center justify-between rounded-md px-3 py-2 text-xs font-medium text-foreground hover:bg-accent"
                        >
                          {opt.label}
                          {sortBy === opt.value && <Check className="h-3.5 w-3.5 text-primary" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </section>


            <section className="px-4 pt-4">
              {!showLoadingState && restaurants && restaurants.length > 0 && (
                <h2 className="mb-3 text-lg font-bold text-foreground min-[480px]:hidden">
                  {filtered.length} restaurant{filtered.length > 1 ? "s" : ""}
                </h2>
              )}

              {showLoadingState ? (
                <RestaurantListSkeleton count={4} />
              ) : isError ? (
                <p className="py-8 text-center text-sm text-destructive">
                  Erreur de chargement restaurants: {(error as Error)?.message || "réessaie"}
                </p>
              ) : filtered.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Aucun restaurant trouvé
                </p>
              ) : (
                <div className="space-y-3 pb-4">
                  {filtered.map((resto) => (
                    <RestaurantCard
                      key={resto.id}
                      id={resto.id}
                      slug={resto.slug}
                      name={resto.name}
                      image_url={resto.image_url}
                      logo_url={resto.logo_url}
                      is_open={isOpenNow(resto.opening_hours, resto.is_open)}
                      halal_type={resto.halal_type}
                      rating={resto.rating}
                      avg_prep_time={resto.avg_prep_time}
                      avg_delivery_time={resto.avg_delivery_time}
                      delivery_mode={resto.delivery_mode}
                      address={resto.address}
                    />
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </ClientLayout>
  );
};

// ── Sidebar Toggle ─────────────────────────────────────────────────
const SidebarToggle = ({
  label,
  checked,
  onChange,
  icon,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  icon?: React.ReactNode;
}) => (
  <div className="flex items-center justify-between">
    <span className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
      {icon}
      {label}
    </span>
    <Switch checked={checked} onCheckedChange={onChange} />
  </div>
);

// ── Filter Chip ────────────────────────────────────────────────────
const FilterChip = ({
  label,
  active,
  onToggle,
}: {
  label: string;
  active: boolean;
  onToggle: () => void;
}) => (
  <button
    onClick={onToggle}
    className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors ${
      active
        ? "border-primary bg-primary text-primary-foreground"
        : "border-border bg-background text-foreground hover:border-primary/40"
    }`}
  >
    {label}
  </button>
);

export default Home;

// ── Order Mode Chip ────────────────────────────────────────────────
const OrderModeChip = ({
  icon,
  label,
  active,
  onToggle,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onToggle: () => void;
}) => (
  <button
    onClick={onToggle}
    className={`shrink-0 flex items-center gap-1 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors ${
      active
        ? "border-primary bg-primary text-primary-foreground"
        : "border-border bg-background text-foreground hover:border-primary/40"
    }`}
  >
    {icon}
    {label}
  </button>
);
