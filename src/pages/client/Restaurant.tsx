import { ShoppingBag } from "lucide-react";
import { useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchRestaurantBySlug } from "@/services/restaurantService";
import { fetchMenuByRestaurantId, fetchProductOptionGroups, prefetchAllProductOptions } from "@/services/menuService";
import { fetchRestaurantConfig } from "@/services/restaurantConfigService";
import { persistGet } from "@/lib/persistCache";
import ClientLayout from "@/layouts/ClientLayout";
import ProductModal from "@/components/product/ProductModal";
import { useCart } from "@/contexts/useCart";
import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { dbg } from "@/lib/debugLog";
import { haversineKm } from "@/lib/geo";
import { useImagePrefetch, optimizedUrl } from "@/hooks/useImagePrefetch";
import { getSavedAddress, setSavedAddress } from "@/lib/savedAddress";
import { menuBasePrice, isWeekend } from "../../../supabase/functions/_shared/menuPricing";
import { isOpenAt } from "@/lib/openingHours";
import type { Tables } from "@/integrations/supabase/types";
import type { MenuCategory } from "@/services/menuService";

import RestaurantHero from "@/components/restaurant/RestaurantHero";
import RestaurantInfo from "@/components/restaurant/RestaurantInfo";
import OrderTypeSelector from "@/components/restaurant/OrderTypeSelector";
import MenuSearch from "@/components/restaurant/MenuSearch";
import CategoryTabs from "@/components/restaurant/CategoryTabs";
import ProductCard from "@/components/restaurant/ProductCard";
import CartSidebar from "@/components/restaurant/CartSidebar";
import StickyCartBar from "@/components/restaurant/StickyCartBar";
import QrModePopup from "@/components/client/QrModePopup";

const Restaurant = () => {
  const slug = "la-parmigiana";
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const categoryRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const isScrollingToCategory = useRef(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<{
    id: string;
    name: string;
    description: string | null;
    price: number;
    image_url?: string | null;
    menu_supplement?: number | null;
    menu_label?: string | null;
  } | null>(null);
  const [clientAddress, setClientAddress] = useState<{ display_name: string; lat: number; lng: number } | null>(() => getSavedAddress());

  const { itemCount, setOrderType, orderType, scheduledAt } = useCart();
  const queryClient = useQueryClient();
  const [showModePopup, setShowModePopup] = useState(false);
  const [frozenModes, setFrozenModes] = useState<Array<"dine_in" | "takeaway" | "delivery"> | null>(null);

  // Prefetch options then open modal — fires fetch in background, opens modal instantly
  const handleSelectProduct = (p: { id: string; name: string; description: string | null; price: number; image_url?: string | null; menu_supplement?: number | null; menu_label?: string | null }) => {
    // Fire prefetch (non-blocking)
    queryClient.prefetchQuery({
      queryKey: ["product-option-groups", p.id],
      queryFn: () => fetchProductOptionGroups(p.id),
      staleTime: 120_000,
    });
    setSelectedProduct(p);
  };
  const modePopupShown = useRef(false);

  // Seed from localStorage for instant render (Uber Eats pattern)
  const persistedRestaurant = useMemo(() => slug ? persistGet<Tables<"restaurants">>(`restaurant:${slug}`) : null, [slug]);
  const persistedMenu = useMemo(() => {
    const rid = persistedRestaurant?.id;
    return rid ? persistGet<MenuCategory[]>(`menu:${rid}`) : null;
  }, [persistedRestaurant]);

  const { data: restaurant, isLoading: loadingRestaurant } = useQuery({
    queryKey: ["restaurant", slug],
    queryFn: () => fetchRestaurantBySlug(slug!),
    enabled: !!slug,
    initialData: persistedRestaurant || undefined,
    staleTime: 120_000,
    gcTime: 600_000,
    placeholderData: (prev) => prev,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
  });

  const { data: rawCategories, isLoading: loadingMenu } = useQuery({
    queryKey: ["menu", restaurant?.id],
    queryFn: () => fetchMenuByRestaurantId(restaurant!.id),
    enabled: !!restaurant?.id,
    initialData: persistedMenu && persistedMenu.length > 0 ? persistedMenu : undefined,
    staleTime: 120_000,
    gcTime: 600_000,
    placeholderData: (prev) => prev,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
  });

  const categories = useMemo(() => rawCategories?.map((cat) => ({ ...cat, products: cat.products.map((product) => ({
    ...product, price: menuBasePrice(Number(product.price), orderType, restaurant?.digital_menu_enabled ?? false, Number(restaurant?.takeaway_discount || 0)),
    is_available: product.is_available && (!product.weekend_only || isWeekend()),
  })) })), [rawCategories, orderType, restaurant]);

  // 🔥 Bulk prefetch ALL product options in 2-3 queries instead of 2N
  const prefetchedRef = useRef(false);
  useEffect(() => {
    if (!categories?.length || prefetchedRef.current) return;
    prefetchedRef.current = true;

    const allProductIds = categories.flatMap((cat) =>
      cat.products.map((product) => product.id)
    );

    if (allProductIds.length === 0) return;

    // Single bulk fetch → populates React Query cache for each product
    prefetchAllProductOptions(allProductIds, (pid, data) => {
      queryClient.setQueryData(["product-option-groups", pid], data);
    });
  }, [categories, queryClient]);

  // 🖼️ Batch prefetch all product images when menu loads
  const allProductImages = useMemo(() => {
    if (!categories) return [];
    return categories.flatMap((cat) =>
      cat.products
        .map((product) => product.image_url)
        .filter(Boolean)
        .map((url: string) => optimizedUrl(url, 140, 70))
    );
  }, [categories]);
  useImagePrefetch(allProductImages);

  const { data: restoConfig } = useQuery({
    queryKey: ["resto-config", restaurant?.id],
    queryFn: () => fetchRestaurantConfig(restaurant!.id),
    enabled: !!restaurant?.id,
  });

  // Compute available modes from restaurant/config without waiting for config fetch
  const effectiveDeliveryMode = restoConfig?.delivery_mode ?? restaurant?.delivery_mode ?? "disabled";
  const effectiveDineIn = restoConfig?.dine_in_enabled ?? restaurant?.dine_in_enabled ?? true;
  dbg("restaurant", "Delivery mode", { effectiveDeliveryMode, fromConfig: restoConfig?.delivery_mode, fromRestaurant: restaurant?.delivery_mode });
  const availableModes = useMemo(() => {
    const modes: Array<"dine_in" | "takeaway" | "delivery"> = ["takeaway"];
    if (effectiveDineIn) modes.unshift("dine_in");
    if (effectiveDeliveryMode !== "disabled") {
      modes.push("delivery");
    }
    return modes;
  }, [effectiveDeliveryMode, effectiveDineIn]);

  // Show mode popup instantly when restaurant loads (uses restaurant-level fields, no config wait)
  // Compute modes from restaurant object directly for the popup (instant, no latency)
  const restaurantModes = useMemo(() => {
    if (!restaurant) return null;
    const rDelivery = restaurant.delivery_mode ?? "disabled";
    const rDineIn = restaurant.dine_in_enabled ?? true;
    const modes: Array<"dine_in" | "takeaway" | "delivery"> = ["takeaway"];
    if (rDineIn) modes.unshift("dine_in");
    if (rDelivery !== "disabled") modes.push("delivery");
    return modes;
  }, [restaurant]);

  useEffect(() => {
    if (!restaurant || !restaurantModes || modePopupShown.current) return;

    const isQr = sessionStorage.getItem("rzfood_order_source") === "qr";
    if (!isQr) {
      sessionStorage.removeItem("rzfood_order_source");
      sessionStorage.removeItem("rzfood_table_number");
      sessionStorage.removeItem("rzfood_qr_seen");
      modePopupShown.current = true;
      setFrozenModes([...restaurantModes]);
      setShowModePopup(true);
    }
  }, [restaurant, restaurantModes]);

  const deliveryBlocked = useMemo(() => {
    if (effectiveDeliveryMode === "disabled") return true;
    if (!restoConfig) return false; // don't block UI while config loads/fallbacks resolve
    if (!clientAddress || !restoConfig.latitude || !restoConfig.longitude) return orderType === "delivery";
    const dist = haversineKm(restoConfig.latitude, restoConfig.longitude, clientAddress.lat, clientAddress.lng);
    return dist > restoConfig.max_delivery_radius_km;
  }, [effectiveDeliveryMode, restoConfig, clientAddress, orderType]);

  const isClosedBySchedule = useMemo(() => {
    if (!restoConfig || !restoConfig.opening_hours || Object.keys(restoConfig.opening_hours).length === 0) return false;
    return !isOpenAt(restoConfig.opening_hours);
  }, [restoConfig]);

  const isLoading = loadingRestaurant || loadingMenu;

  useEffect(() => {
    if (categories && categories.length > 0 && !activeCategory) {
      setActiveCategory(categories[0].id);
    }
  }, [categories, activeCategory]);

  // Scroll to category section when tab is clicked
  const handleCategorySelect = (catId: string) => {
    setActiveCategory(catId);
    const el = categoryRefs.current[catId];
    if (el) {
      isScrollingToCategory.current = true;
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setTimeout(() => { isScrollingToCategory.current = false; }, 800);
    }
  };

  // Filter products by search
  const filteredCategories = useMemo(() => {
    if (!categories) return [];
    if (!searchQuery.trim()) return categories;
    const q = searchQuery.toLowerCase();
    return categories
      .map((cat) => ({
        ...cat,
        products: cat.products.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            (p.description && p.description.toLowerCase().includes(q))
        ),
      }))
      .filter((cat) => cat.products.length > 0);
  }, [categories, searchQuery]);

  // Featured products
  const featuredProducts = useMemo(() => {
    if (!categories) return [];
    return categories.flatMap((cat) => cat.products.filter((product) => product.is_featured));
  }, [categories]);

  // Update active tab on scroll via IntersectionObserver
  useEffect(() => {
    if (!filteredCategories || filteredCategories.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (isScrollingToCategory.current) return;
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveCategory(entry.target.getAttribute("data-cat-id") || null);
            break;
          }
        }
      },
      { rootMargin: "-80px 0px -70% 0px", threshold: 0 }
    );
    Object.values(categoryRefs.current).forEach((el) => {
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [filteredCategories]);

  if (isLoading && !restaurant) {
    return (
      <ClientLayout>
        <div className="animate-pulse">
          <div className="h-48 bg-muted" />
          <div className="px-5 py-4 space-y-3">
            <div className="h-6 w-48 bg-muted rounded" />
            <div className="h-4 w-72 bg-muted rounded" />
            <div className="flex gap-3 mt-4">
              <div className="h-8 w-20 bg-muted rounded-full" />
              <div className="h-8 w-20 bg-muted rounded-full" />
              <div className="h-8 w-20 bg-muted rounded-full" />
            </div>
            <div className="space-y-3 mt-6">
              {[1,2,3].map(i => (
                <div key={i} className="flex gap-3">
                  <div className="h-20 w-20 bg-muted rounded-lg flex-shrink-0" />
                  <div className="flex-1 space-y-2 py-1">
                    <div className="h-4 w-32 bg-muted rounded" />
                    <div className="h-3 w-48 bg-muted rounded" />
                    <div className="h-4 w-16 bg-muted rounded" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </ClientLayout>
    );
  }

  if (!restaurant) {
    return (
      <ClientLayout>
        <div className="px-4 py-20 text-center text-muted-foreground">
          Restaurant introuvable
        </div>
      </ClientLayout>
    );
  }

  const isActuallyClosed = !restaurant.is_open || isClosedBySchedule;
  const isClosed = isActuallyClosed && !scheduledAt;
  const deliveryDisabled = effectiveDeliveryMode === "disabled";

  return (
    <ClientLayout>
      <div className="animate-fade-in">
        <RestaurantHero
          restaurantName={restaurant.name}
          imageUrl={restaurant.image_url}
          logoUrl={restaurant.logo_url}
          itemCount={itemCount}
        />

        {/* Main content: menu + optional cart sidebar */}
        <div className="mx-auto flex max-w-6xl gap-6">
          {/* Left: menu */}
          <div className="min-w-0 flex-1">
            <RestaurantInfo
              name={restaurant.name}
              description={restaurant.description}
              rating={restaurant.rating}
              avgPrepTime={restaurant.avg_prep_time}
              avgDeliveryTime={restoConfig?.avg_delivery_time ?? null}
              deliveryFee={restaurant.delivery_flat_fee}
              isFreeDelivery={restaurant.is_free_delivery}
              halalType={restaurant.halal_type}
              isClosed={isClosed}
              orderType={orderType}
            />

            <OrderTypeSelector
              orderType={orderType}
              setOrderType={setOrderType}
              availableModes={availableModes}
              deliveryBlocked={deliveryBlocked}
              clientAddress={clientAddress}
              onSelectAddress={(addr) => { setClientAddress(addr); setSavedAddress(addr); }}
              onClearAddress={() => { setClientAddress(null); setSavedAddress(null); }}
              openingHours={restoConfig?.opening_hours}
              schedulingMode={restoConfig?.scheduling_mode || "all"}
              isRestaurantClosed={isActuallyClosed}
            />

            <MenuSearch
              value={searchQuery}
              onChange={setSearchQuery}
              restaurantName={restaurant.name}
            />

            {categories && categories.length > 0 && (
              <CategoryTabs
                categories={categories}
                activeCategory={activeCategory}
                onSelect={handleCategorySelect}
              />
            )}

            {/* Featured products */}
            {featuredProducts.length > 0 && !searchQuery && (
              <div className="px-5 pt-4 pb-2">
                <h2 className="mb-2 text-lg font-extrabold text-foreground flex items-center gap-1.5">
                  ⭐ Nos vedettes
                </h2>
                <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none">
                  {featuredProducts.map((product) => (
                    <button
                      key={product.id}
                      onClick={() => !isClosed && handleSelectProduct({ id: product.id, name: product.name, description: product.description, price: product.price, image_url: product.image_url, menu_supplement: product.menu_supplement, menu_label: product.menu_label })}
                      className="flex-shrink-0 w-36 rounded-xl border bg-card shadow-card overflow-hidden text-left"
                    >
                      {product.image_url ? (
                        <img src={product.image_url} alt={product.name} loading="lazy" decoding="async" className="h-24 w-full object-cover" />
                      ) : (
                        <div className="h-24 w-full bg-muted flex items-center justify-center text-2xl">🍽️</div>
                      )}
                      <div className="p-2">
                        <p className="text-xs font-bold text-card-foreground truncate">{product.name}</p>
                        <p className="text-xs font-semibold text-primary">{Number(product.price).toFixed(2)} €</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Products */}
            <div className="px-5 py-4">
              {filteredCategories.length === 0 ? (
                <div className="flex flex-col items-center py-16 text-muted-foreground">
                  <ShoppingBag className="mb-3 h-10 w-10" />
                  <p className="text-sm font-medium">Aucun article disponible</p>
                  <p className="mt-1 text-xs">Le restaurant prépare son menu.</p>
                </div>
              ) : (
                filteredCategories.map((cat) => (
                  <div key={cat.id} data-cat-id={cat.id} ref={(el) => { categoryRefs.current[cat.id] = el; }} className="mb-2 scroll-mt-14">
                    <h2 className="mb-1 text-lg font-extrabold text-foreground">{cat.name}</h2>
                    <div>
                      {cat.products.map((product) => (
                        <ProductCard
                          key={product.id}
                          product={product}
                          isClosed={isClosed}
                          onAdd={(p) =>
                            handleSelectProduct({
                              id: p.id,
                              name: p.name,
                              description: p.description,
                              price: p.price,
                              image_url: p.image_url,
                              menu_supplement: p.menu_supplement,
                              menu_label: p.menu_label,
                            })
                          }
                        />
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Right: cart sidebar (desktop only) */}
          <div className="hidden w-80 flex-shrink-0 pt-10 lg:block">
            <CartSidebar />
          </div>
        </div>
      </div>

      <ProductModal
        product={selectedProduct}
        restaurantId={restaurant?.id || ""}
        open={!!selectedProduct}
        onClose={() => setSelectedProduct(null)}
      />

      <StickyCartBar />

      <QrModePopup
        externalOpen={showModePopup}
        onClose={() => { setShowModePopup(false); setFrozenModes(null); }}
        modes={frozenModes || availableModes}
      />
    </ClientLayout>
  );
};

export default Restaurant;
