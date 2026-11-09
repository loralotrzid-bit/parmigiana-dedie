import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MapPin, Clock, Truck, Loader2, Save, Search, QrCode, Pause, Play, Download, Settings, Upload, Banknote, CreditCard, Tag, X, BarChart3, Shield, EyeOff, Eye, Building2, Plus, Trash2 } from "lucide-react";
import AdminLayout from "@/layouts/AdminLayout";
import { useAuth } from "@/contexts/useAuth";
import { fetchAdminRestaurantConfig, updateRestaurantConfig, type RestaurantConfig } from "@/services/restaurantConfigService";
import { insertAuditLog } from "@/services/auditService";
import { searchAddress } from "@/lib/geo";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { safeToast } from "@/lib/safeToast";
import PromoCodeManager from "@/components/admin/PromoCodeManager";
import AdvancedStats from "@/components/admin/AdvancedStats";
import TwoFactorSetup from "@/components/admin/TwoFactorSetup";
import QRCode from "qrcode";
import PhoneDeliveryRatesManager from "@/components/admin/PhoneDeliveryRatesManager";
import { defaultOpeningHours, normalizeOpeningHours, type OpeningHours } from "@/lib/openingHours";

const DAYS = [
  { key: "monday", label: "Lundi" }, { key: "tuesday", label: "Mardi" },
  { key: "wednesday", label: "Mercredi" }, { key: "thursday", label: "Jeudi" },
  { key: "friday", label: "Vendredi" }, { key: "saturday", label: "Samedi" },
  { key: "sunday", label: "Dimanche" },
];

const DELIVERY_MODES = [
  { value: "disabled", label: "Désactivé", desc: "Pas de livraison" },
  { value: "flat", label: "Forfaitaire", desc: "Un prix fixe" },
  { value: "dynamic", label: "Au kilomètre", desc: "Gratuit sous X km, puis €/km" },
  { value: "free", label: "Gratuit", desc: "Livraison offerte" },
];

const HALAL_OPTIONS = [
  { value: "yes", label: "100% Halal", color: "bg-success/10 text-success border-success/30" },
  { value: "mixed", label: "Mixte", color: "bg-warning/10 text-warning border-warning/30" },
  { value: "no", label: "Non halal", color: "bg-muted text-muted-foreground border-border" },
];

const ALL_CUISINE_CATEGORIES = [
  "Pizza", "Pita / Kebab", "Pâtes", "Burgers", "Sushi", "Chinois", "Poke bowl",
  "Frites", "Africain", "Américain", "Asiatique", "Autre", "Boissons / Snacks",
  "Bubble Tea", "Coréen", "Crêpes", "Curry", "Falafel", "Grec", "Grill", "Gyros",
  "Indien", "Italien", "Japonais", "Libanais", "Lunch", "Marocain", "Mexicain",
  "Nouilles", "Pause sucrée", "Petit déjeuner", "Pizza Américaine", "Pizza Turque",
  "Poisson et Fruits de mer", "Poulet", "Salades", "Sandwiches", "Smoothies / Jus",
  "Snacks", "Soupes", "Steak", "Tacos", "Tacos Français", "Tandoori", "Thaïlandais",
  "Turc", "Wok",
];

const defaultHours = () => {
  const h = defaultOpeningHours();
  h.sunday = { closed: false, intervals: [{ open: "12:00", close: "14:30" }, { open: "17:30", close: "23:00" }] };
  h.monday = { closed: true, intervals: [] };
  h.tuesday = { closed: false, intervals: [{ open: "11:30", close: "14:30" }, { open: "17:30", close: "22:00" }] };
  h.wednesday = { closed: false, intervals: [{ open: "12:00", close: "14:30" }, { open: "17:30", close: "22:00" }] };
  h.thursday = { closed: false, intervals: [{ open: "12:00", close: "14:30" }, { open: "17:30", close: "22:00" }] };
  h.friday = { closed: false, intervals: [{ open: "17:30", close: "23:00" }] };
  h.saturday = { closed: false, intervals: [{ open: "12:00", close: "14:30" }, { open: "17:30", close: "23:00" }] };
  return h;
};

const RestaurantSettings = () => {
  const { restaurantId, user } = useAuth();
  const queryClient = useQueryClient();

  const { data: config, isLoading } = useQuery({
    queryKey: ["restaurant-config", restaurantId],
    queryFn: () => fetchAdminRestaurantConfig(restaurantId!),
    enabled: !!restaurantId,
  });

  const { data: restaurant } = useQuery({
    queryKey: ["restaurant-detail", restaurantId],
    queryFn: async () => {
      const { data } = await supabase.from("restaurants").select("name, slug, is_paused, is_visible").eq("id", restaurantId!).single();
      return data;
    },
    enabled: !!restaurantId,
  });

  // Company info query
  const { data: companyData } = useQuery({
    queryKey: ["company-info", restaurantId],
    queryFn: async () => {
      const { data } = await supabase.from("restaurants")
        .select("company_name, vat_number, company_address, company_email, company_phone")
        .eq("id", restaurantId!)
        .single();
      return data;
    },
    enabled: !!restaurantId,
  });

  // General settings state
  const [description, setDescription] = useState("");
  const [cuisineType, setCuisineType] = useState("");
  const [halalType, setHalalType] = useState("no");
  const [avgPrepTime, setAvgPrepTime] = useState(20);
  const [avgDeliveryTime, setAvgDeliveryTime] = useState(30);
  const [imageUrl, setImageUrl] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [acceptedPayments, setAcceptedPayments] = useState<string[]>(["cash", "card_delivery", "wero"]);
  const [cuisineCategories, setCuisineCategories] = useState<string[]>([]);
  const [showCategoryPopup, setShowCategoryPopup] = useState(false);
  const [tempCategories, setTempCategories] = useState<string[]>([]);

  // Company info state
  const [companyName, setCompanyName] = useState("");
  const [vatNumber, setVatNumber] = useState("");
  const [companyAddress, setCompanyAddress] = useState("");
  const [companyEmail, setCompanyEmail] = useState("");
  const [companyPhone, setCompanyPhone] = useState("");

  // Location state
  const [address, setAddress] = useState("");
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [suggestions, setSuggestions] = useState<Array<{ display_name: string; lat: number; lng: number }>>([]);

  // Delivery state
  const [deliveryMode, setDeliveryMode] = useState("disabled");
  const [dineInEnabled, setDineInEnabled] = useState(true);
  const [schedulingMode, setSchedulingMode] = useState("all");
  const [flatFee, setFlatFee] = useState(5);
  const [freeUnderKm, setFreeUnderKm] = useState(3);
  const [perKmFee, setPerKmFee] = useState(1);
  const [maxRadius, setMaxRadius] = useState(10);

  // Hours state
  const [hours, setHours] = useState<OpeningHours>(defaultHours());

  useEffect(() => {
    if (config) {
      setDescription(config.description || "");
      setCuisineType(config.cuisine_type || "");
      setHalalType(config.halal_type || "no");
      setAvgPrepTime(config.avg_prep_time ?? 20);
      setAvgDeliveryTime(config.avg_delivery_time ?? 30);
      setImageUrl(config.image_url || "");
      setLogoUrl(config.logo_url || "");
      setAddress(config.address || "");
      setLat(config.latitude);
      setLng(config.longitude);
      setDeliveryMode(config.delivery_mode);
      setDineInEnabled(config.dine_in_enabled !== false);
      setSchedulingMode(config.scheduling_mode || "all");
      setFlatFee(config.delivery_flat_fee);
      setFreeUnderKm(config.delivery_free_under_km ?? 3);
      setPerKmFee(config.delivery_per_km_fee);
      setMaxRadius(config.max_delivery_radius_km);
      setHours(Object.keys(normalizeOpeningHours(config.opening_hours)).length > 0 ? normalizeOpeningHours(config.opening_hours) : defaultHours());
      setAcceptedPayments(config.accepted_payments || ["cash", "card_delivery", "wero"]);
      setCuisineCategories(config.cuisine_categories || []);
    }
  }, [config]);

  useEffect(() => {
    if (companyData) {
      setCompanyName(companyData.company_name || "");
      setVatNumber(companyData.vat_number || "");
      setCompanyAddress(companyData.company_address || "");
      setCompanyEmail(companyData.company_email || "");
      setCompanyPhone(companyData.company_phone || "");
    }
  }, [companyData]);

  const handleAddressSearch = useCallback(async (q: string) => {
    setAddress(q);
    if (q.length >= 3) {
      const results = await searchAddress(q);
      setSuggestions(results);
    } else {
      setSuggestions([]);
    }
  }, []);

  const selectAddress = (s: { display_name: string; lat: number; lng: number }) => {
    setAddress(s.display_name);
    setLat(s.lat);
    setLng(s.lng);
    setSuggestions([]);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !restaurantId) return;
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${restaurantId}/cover.${ext}`;
    const { error } = await supabase.storage.from("restaurant-images").upload(path, file, { upsert: true });
    if (error) {
      safeToast.error("Erreur upload image");
      setUploading(false);
      return;
    }
    const { data: urlData } = supabase.storage.from("restaurant-images").getPublicUrl(path);
    const url = urlData.publicUrl + "?t=" + Date.now();
    setImageUrl(url);
    // Auto-save to DB immediately
    await supabase.from("restaurants").update({ image_url: url }).eq("id", restaurantId);
    setUploading(false);
    safeToast.success("Image uploadée et sauvegardée");
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !restaurantId) return;
    setUploadingLogo(true);
    const ext = file.name.split(".").pop();
    const path = `${restaurantId}/logo.${ext}`;
    const { error } = await supabase.storage.from("restaurant-images").upload(path, file, { upsert: true });
    if (error) {
      safeToast.error("Erreur upload logo");
      setUploadingLogo(false);
      return;
    }
    const { data: urlData } = supabase.storage.from("restaurant-images").getPublicUrl(path);
    const url = urlData.publicUrl + "?t=" + Date.now();
    setLogoUrl(url);
    // Auto-save to DB immediately
    await supabase.from("restaurants").update({ logo_url: url }).eq("id", restaurantId);
    setUploadingLogo(false);
    safeToast.success("Logo uploadé et sauvegardé");
  };

  const mutation = useMutation({
    mutationFn: async () => {
      await updateRestaurantConfig(restaurantId!, {
        address, latitude: lat, longitude: lng,
        delivery_mode: deliveryMode, delivery_flat_fee: flatFee,
        delivery_free_under_km: deliveryMode === "dynamic" ? freeUnderKm : null,
        delivery_per_km_fee: perKmFee, max_delivery_radius_km: maxRadius,
        opening_hours: hours,
        description: description || null,
        cuisine_type: cuisineType || null,
        halal_type: halalType,
        avg_prep_time: avgPrepTime,
        avg_delivery_time: avgDeliveryTime,
        dine_in_enabled: dineInEnabled,
        scheduling_mode: schedulingMode,
        // image_url & logo_url are saved individually on upload — never overwrite here
        // to prevent accidental erasure when state hasn't loaded yet
        ...(imageUrl ? { image_url: imageUrl } : {}),
        ...(logoUrl ? { logo_url: logoUrl } : {}),
        accepted_payments: acceptedPayments,
        cuisine_categories: cuisineCategories,
      });
      if (user?.id && restaurantId) {
        await insertAuditLog(restaurantId, user.id, "config_update", {
          delivery_mode: deliveryMode, halal_type: halalType,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["restaurant-config"] });
      queryClient.invalidateQueries({ queryKey: ["restaurant-detail"] });
      safeToast.success("Configuration sauvegardée");
      console.log("[Settings] Config saved successfully");
    },
    onError: (err) => {
      safeToast.error("Erreur lors de la sauvegarde");
      console.error("[Settings] Save error:", err?.message, err);
    },
  });

  const pauseMutation = useMutation({
    mutationFn: async (paused: boolean) => {
      await supabase.from("restaurants").update({ is_paused: paused }).eq("id", restaurantId!);
      if (user?.id && restaurantId) {
        await insertAuditLog(restaurantId, user.id, paused ? "pause_orders" : "resume_orders", {});
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["restaurant-detail"] });
      safeToast.success(restaurant?.is_paused ? "Commandes réactivées" : "Commandes en pause");
    },
  });

  const visibilityMutation = useMutation({
    mutationFn: async (visible: boolean) => {
      await supabase.from("restaurants").update({ is_visible: visible }).eq("id", restaurantId!);
      if (user?.id && restaurantId) {
        await insertAuditLog(restaurantId, user.id, visible ? "show_restaurant" : "hide_restaurant", {});
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["restaurant-detail"] });
    },
  });

  const updateDayClosed = (day: string, closed: boolean) => setHours((prev) => ({
    ...prev,
    [day]: { ...(prev[day] || { intervals: [] }), closed, intervals: closed ? [] : (prev[day]?.intervals.length ? prev[day].intervals : [{ open: "12:00", close: "14:30" }]) },
  }));
  const updateInterval = (day: string, index: number, field: "open" | "close", value: string) => setHours((prev) => ({
    ...prev,
    [day]: { ...prev[day], intervals: prev[day].intervals.map((interval, current) => current === index ? { ...interval, [field]: value } : interval) },
  }));
  const addInterval = (day: string) => setHours((prev) => ({
    ...prev,
    [day]: { closed: false, intervals: [...(prev[day]?.intervals || []), { open: "17:30", close: "22:00" }] },
  }));
  const removeInterval = (day: string, index: number) => setHours((prev) => ({
    ...prev,
    [day]: { ...prev[day], intervals: prev[day].intervals.filter((_, current) => current !== index) },
  }));

  const qrUrl = restaurant?.slug ? `${window.location.origin}/restaurant/${restaurant.slug}?source=qr` : "";
  const [restaurantQrDataUrl, setRestaurantQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!qrUrl) return;
    QRCode.toDataURL(qrUrl, { width: 400, margin: 2, color: { dark: "#000000", light: "#ffffff" } })
      .then(setRestaurantQrDataUrl)
      .catch(() => setRestaurantQrDataUrl(null));
  }, [qrUrl]);

  const downloadQrCode = () => {
    if (!restaurantQrDataUrl) return;
    const link = document.createElement("a");
    link.href = restaurantQrDataUrl;
    link.download = `qr-${restaurant?.slug || "restaurant"}.png`;
    link.click();
  };

  if (isLoading) {
    return <AdminLayout><div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div></AdminLayout>;
  }

  const isPaused = restaurant?.is_paused;
  const isVisible = restaurant?.is_visible !== false;

  return (
    <AdminLayout>
      <div className="animate-fade-in px-4 pt-4 pb-24">
        <h1 className="text-lg font-extrabold text-foreground mb-1">Configuration</h1>
        {restaurant?.slug && (
          <div className="mb-4 rounded-lg border bg-muted/50 px-3 py-2">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Code restaurant</p>
            <p className="text-sm font-mono font-bold text-primary select-all">{restaurant.slug}</p>
          </div>
        )}

        <button onClick={() => visibilityMutation.mutate(!isVisible)} disabled={visibilityMutation.isPending}
          className={`mb-2 flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold transition-colors ${
            isVisible ? "bg-warning/15 text-warning border border-warning/30" : "bg-success text-success-foreground"
          } disabled:opacity-60`}>
          {isVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          {isVisible ? "Masquer le restaurant" : "🔓 Rendre visible sur Rz Food"}
        </button>

        <button onClick={() => pauseMutation.mutate(!isPaused)} disabled={pauseMutation.isPending}
          className={`mb-4 flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold transition-colors ${
            isPaused ? "bg-success text-success-foreground" : "bg-destructive text-destructive-foreground"
          } disabled:opacity-60`}>
          {isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
          {isPaused ? "Réactiver les commandes" : "⏸ Mettre en pause (Rush)"}
        </button>

        <Tabs defaultValue="general">
          <TabsList className="w-full flex-wrap h-auto gap-1">
            <TabsTrigger value="general" className="flex-1 gap-1 text-xs"><Settings className="h-3.5 w-3.5" /> Général</TabsTrigger>
            <TabsTrigger value="location" className="flex-1 gap-1 text-xs"><MapPin className="h-3.5 w-3.5" /> Adresse</TabsTrigger>
            <TabsTrigger value="delivery" className="flex-1 gap-1 text-xs"><Truck className="h-3.5 w-3.5" /> Livraison</TabsTrigger>
            <TabsTrigger value="hours" className="flex-1 gap-1 text-xs"><Clock className="h-3.5 w-3.5" /> Horaires</TabsTrigger>
            <TabsTrigger value="payments" className="flex-1 gap-1 text-xs"><Banknote className="h-3.5 w-3.5" /> Paiements</TabsTrigger>
            <TabsTrigger value="promos" className="flex-1 gap-1 text-xs"><Tag className="h-3.5 w-3.5" /> Promos</TabsTrigger>
            <TabsTrigger value="stats" className="flex-1 gap-1 text-xs"><BarChart3 className="h-3.5 w-3.5" /> Stats</TabsTrigger>
            <TabsTrigger value="qr" className="flex-1 gap-1 text-xs"><QrCode className="h-3.5 w-3.5" /> QR</TabsTrigger>
            <TabsTrigger value="security" className="flex-1 gap-1 text-xs"><Shield className="h-3.5 w-3.5" /> Sécurité</TabsTrigger>
            <TabsTrigger value="company" className="flex-1 gap-1 text-xs"><Building2 className="h-3.5 w-3.5" /> Société</TabsTrigger>
          </TabsList>

          {/* ── GENERAL ── */}
          <TabsContent value="general">
            <div className="space-y-4 pt-2">
              {/* Image */}
              <div>
                <Label className="text-xs font-semibold">Image de couverture</Label>
                {imageUrl && (
                  <img src={imageUrl} alt="Couverture" className="mt-1 h-32 w-full rounded-xl object-cover border" />
                )}
                <label className="mt-2 flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed py-3 text-xs font-medium text-muted-foreground hover:bg-accent">
                  <Upload className="h-4 w-4" />
                  {uploading ? "Upload en cours…" : "Changer l'image"}
                  <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={uploading} />
                </label>
              </div>

              {/* Logo */}
              <div>
                <Label className="text-xs font-semibold">Logo du restaurant</Label>
                {logoUrl && (
                  <img src={logoUrl} alt="Logo" className="mt-1 h-20 w-20 rounded-xl object-contain border bg-card" />
                )}
                <label className="mt-2 flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed py-3 text-xs font-medium text-muted-foreground hover:bg-accent">
                  <Upload className="h-4 w-4" />
                  {uploadingLogo ? "Upload en cours…" : "Changer le logo"}
                  <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} disabled={uploadingLogo} />
                </label>
              </div>

              {/* Description */}
              <div>
                <Label className="text-xs font-semibold">Description</Label>
                <textarea value={description} onChange={(e) => setDescription(e.target.value.slice(0, 500))}
                  placeholder="Décrivez votre restaurant…" rows={3}
                  className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-primary resize-none placeholder:text-muted-foreground" />
                <p className="text-[11px] text-muted-foreground text-right">{description.length}/500</p>
              </div>

              {/* Cuisine categories */}
              <div>
                <Label className="text-xs font-semibold mb-2 block">Catégories de cuisine</Label>
                {cuisineCategories.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {cuisineCategories.map((cat) => (
                      <span key={cat} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                        {cat}
                        <button onClick={() => setCuisineCategories(prev => prev.filter(c => c !== cat))} className="hover:text-destructive">
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <button
                  onClick={() => { setTempCategories([...cuisineCategories]); setShowCategoryPopup(true); }}
                  className="flex items-center gap-2 rounded-xl border border-dashed py-3 px-4 text-xs font-medium text-muted-foreground hover:bg-accent w-full justify-center"
                >
                  <Tag className="h-4 w-4" /> Sélectionner les catégories
                </button>
              </div>

              {/* Cuisine type (legacy) */}
              <div>
                <Label className="text-xs font-semibold">Type de cuisine (texte libre)</Label>
                <Input value={cuisineType} onChange={(e) => setCuisineType(e.target.value)} placeholder="Fast-food, Turc, Italien…" className="mt-1" />
              </div>

              {/* Halal */}
              <div>
                <Label className="text-xs font-semibold mb-2 block">Certification Halal</Label>
                <div className="flex gap-2">
                  {HALAL_OPTIONS.map((opt) => (
                    <button key={opt.value} onClick={() => setHalalType(opt.value)}
                      className={`flex-1 rounded-xl border-2 p-3 text-center text-sm font-semibold transition-colors ${
                        halalType === opt.value ? opt.color + " border-current" : "border-border text-muted-foreground hover:bg-accent"
                      }`}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Avg prep time */}
              <div>
                <Label className="text-xs font-semibold">Temps moyen de préparation (min)</Label>
                <p className="text-[11px] text-muted-foreground">Pour les commandes à emporter et sur place</p>
                <Input type="number" value={avgPrepTime} onChange={(e) => setAvgPrepTime(Number(e.target.value))} min={1} max={120} className="mt-1" />
              </div>

              {/* Avg delivery time */}
              <div>
                <Label className="text-xs font-semibold">Temps moyen de livraison (min)</Label>
                <p className="text-[11px] text-muted-foreground">Préparation + livraison, affiché aux clients</p>
                <Input type="number" value={avgDeliveryTime} onChange={(e) => setAvgDeliveryTime(Number(e.target.value))} min={5} max={180} className="mt-1" />
              </div>
            </div>
          </TabsContent>

          {/* ── LOCATION ── */}
          <TabsContent value="location">
            <div className="space-y-4 pt-2">
              <div className="relative">
                <Label className="text-xs font-semibold">Adresse du restaurant</Label>
                <div className="relative mt-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input value={address} onChange={(e) => handleAddressSearch(e.target.value)} placeholder="Saisissez l'adresse…" className="pl-9" />
                </div>
                {suggestions.length > 0 && (
                  <div className="absolute z-50 mt-1 w-full rounded-lg border bg-card shadow-elevated max-h-48 overflow-y-auto">
                    {suggestions.map((s, i) => (
                      <button key={i} onClick={() => selectAddress(s)} className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors">
                        {s.display_name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {lat && lng && (
                <div className="rounded-lg bg-success/10 p-3 text-sm text-success font-medium">
                  📍 Coordonnées : {lat.toFixed(5)}, {lng.toFixed(5)}
                </div>
              )}
            </div>
          </TabsContent>

          {/* ── DELIVERY ── */}
          <TabsContent value="delivery">
            <div className="space-y-4 pt-2">
              {/* Dine-in toggle */}
              <div className="flex items-center justify-between rounded-xl border p-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">Sur place</p>
                  <p className="text-[11px] text-muted-foreground">Autoriser les commandes sur place</p>
                </div>
                <Switch checked={dineInEnabled} onCheckedChange={setDineInEnabled} />
              </div>

              {/* Scheduling mode */}
              <div>
                <Label className="text-xs font-semibold mb-2 block">Commandes programmées</Label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: "disabled", label: "Désactivé", desc: "Pas de programmation" },
                    { value: "today_only", label: "Aujourd'hui", desc: "Uniquement le jour même" },
                    { value: "future_only", label: "À partir de demain", desc: "Pas le jour même" },
                    { value: "all", label: "Tout", desc: "Aujourd'hui + jours suivants" },
                  ].map(m => (
                    <button key={m.value} onClick={() => setSchedulingMode(m.value)}
                      className={`rounded-xl border p-3 text-left transition-colors ${
                        schedulingMode === m.value ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
                      }`}>
                      <p className="text-sm font-semibold text-foreground">{m.label}</p>
                      <p className="text-[11px] text-muted-foreground">{m.desc}</p>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label className="text-xs font-semibold mb-2 block">Mode de livraison</Label>
                <div className="grid grid-cols-2 gap-2">
                  {DELIVERY_MODES.map(m => (
                    <button key={m.value} onClick={() => setDeliveryMode(m.value)}
                      className={`rounded-xl border p-3 text-left transition-colors ${
                        deliveryMode === m.value ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
                      }`}>
                      <p className="text-sm font-semibold text-foreground">{m.label}</p>
                      <p className="text-[11px] text-muted-foreground">{m.desc}</p>
                    </button>
                  ))}
                </div>
              </div>
              {deliveryMode === "flat" && (
                <div><Label className="text-xs font-semibold">Frais de livraison (€)</Label>
                  <Input type="number" value={flatFee} onChange={e => setFlatFee(Number(e.target.value))} className="mt-1" /></div>
              )}
              {deliveryMode === "dynamic" && (
                <div className="space-y-3">
                  <div><Label className="text-xs font-semibold">Gratuit sous (km)</Label>
                    <Input type="number" value={freeUnderKm} onChange={e => setFreeUnderKm(Number(e.target.value))} className="mt-1" /></div>
                  <div><Label className="text-xs font-semibold">Frais par km (€)</Label>
                    <Input type="number" step="0.1" value={perKmFee} onChange={e => setPerKmFee(Number(e.target.value))} className="mt-1" /></div>
                </div>
              )}
              {deliveryMode !== "disabled" && (
                <div>
                  <Label className="text-xs font-semibold">Rayon de livraison : {maxRadius} km</Label>
                  <input
                    type="range"
                    min={1}
                    max={50}
                    step={1}
                    value={maxRadius}
                    onChange={e => setMaxRadius(Number(e.target.value))}
                    className="mt-2 w-full accent-primary"
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                    <span>1 km</span>
                    <span>50 km</span>
                  </div>

                  {/* Visual radius preview */}
                  <div className="mt-3 rounded-xl border bg-muted/30 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-foreground">Zone de couverture</span>
                      <span className="text-xs font-bold text-primary">{(Math.PI * maxRadius * maxRadius).toFixed(0)} km²</span>
                    </div>

                    {/* Visual circle */}
                    <div className="flex justify-center">
                      <div className="relative">
                        <div
                          className="rounded-full border-2 border-primary/30 bg-primary/5 flex items-center justify-center transition-all duration-300"
                          style={{
                            width: `${Math.max(40, Math.min(160, maxRadius * 3.2))}px`,
                            height: `${Math.max(40, Math.min(160, maxRadius * 3.2))}px`,
                          }}
                        >
                          <div className="flex flex-col items-center">
                            <MapPin className="h-5 w-5 text-primary" />
                            <span className="text-[10px] font-bold text-primary mt-0.5">{maxRadius} km</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Fee simulation */}
                    {deliveryMode !== "free" && (
                      <div>
                        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Simulation tarifs</p>
                        <div className="grid grid-cols-3 gap-1.5">
                          {[1, Math.round(maxRadius / 2), maxRadius].map((km) => {
                            let fee = 0;
                            if (deliveryMode === "flat") fee = flatFee;
                            else if (deliveryMode === "dynamic") fee = km <= freeUnderKm ? 0 : (km - freeUnderKm) * perKmFee;
                            return (
                              <div key={km} className="rounded-lg bg-card border px-2 py-1.5 text-center">
                                <p className="text-[10px] text-muted-foreground">{km} km</p>
                                <p className={`text-xs font-bold ${fee === 0 ? "text-success" : "text-foreground"}`}>
                                  {fee === 0 ? "Gratuit" : `${fee.toFixed(2)} €`}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {lat && lng && (
                      <p className="text-[10px] text-muted-foreground text-center">
                        Centré sur : {lat.toFixed(4)}, {lng.toFixed(4)}
                      </p>
                    )}
                    {!lat && (
                      <p className="text-[10px] text-warning text-center font-semibold">
                        ⚠️ Configurez l'adresse du restaurant pour activer le rayon
                      </p>
                    )}
                  </div>
                </div>
              )}
              <PhoneDeliveryRatesManager />
            </div>
          </TabsContent>

          {/* ── HOURS ── */}
          <TabsContent value="hours">
            <div className="space-y-3 pt-2">
              {DAYS.map(day => (
                <div key={day.key} className="rounded-xl border bg-card p-3">
                  <div className="flex items-center gap-3">
                    <div className="w-20"><p className="text-sm font-semibold text-foreground">{day.label}</p></div>
                    <Switch checked={!hours[day.key]?.closed} onCheckedChange={(v) => updateDayClosed(day.key, !v)} />
                    {hours[day.key]?.closed && <span className="text-xs text-muted-foreground">Fermé</span>}
                    {!hours[day.key]?.closed && <button onClick={() => addInterval(day.key)} className="ml-auto inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold"><Plus className="h-3.5 w-3.5"/>Ajouter un service</button>}
                  </div>
                  {!hours[day.key]?.closed && <div className="mt-3 space-y-2 pl-2 sm:pl-24">
                    {(hours[day.key]?.intervals || []).map((interval, index) => <div key={`${day.key}-${index}`} className="flex items-center gap-2">
                      <span className="w-16 shrink-0 text-xs text-muted-foreground">Service {index + 1}</span>
                      <Input aria-label={`${day.label} service ${index + 1} ouverture`} type="time" value={interval.open} onChange={e => updateInterval(day.key, index, "open", e.target.value)} className="h-8 text-xs" />
                      <span className="text-xs text-muted-foreground">→</span>
                      <Input aria-label={`${day.label} service ${index + 1} fermeture`} type="time" value={interval.close} onChange={e => updateInterval(day.key, index, "close", e.target.value)} className="h-8 text-xs" />
                      {hours[day.key].intervals.length > 1 && <button aria-label={`Retirer ${day.label} service ${index + 1}`} onClick={() => removeInterval(day.key, index)} className="rounded-md p-2 text-destructive hover:bg-destructive/10"><Trash2 className="h-4 w-4"/></button>}
                    </div>)}
                  </div>}
                </div>
              ))}
            </div>
          </TabsContent>

          {/* ── PAYMENTS ── */}
          <TabsContent value="payments">
            <div className="space-y-4 pt-2">
              <div>
                <Label className="text-xs font-semibold mb-2 block">Moyens de paiement acceptés</Label>
                <div className="space-y-2">
                  {[
                    { key: "cash", label: "Cash (espèces)", icon: Banknote },
                    { key: "card_delivery", label: "Carte à la livraison", icon: CreditCard },
                    { key: "card_counter", label: "Carte au comptoir", icon: CreditCard },
                    { key: "wero", label: "Wero (QR code)", icon: Banknote },
                  ].map(({ key, label, icon: Icon }) => (
                    <label key={key} className="flex items-center gap-3 rounded-xl border p-3 cursor-pointer hover:bg-accent transition-colors">
                      <Switch
                        checked={acceptedPayments.includes(key)}
                        onCheckedChange={(checked) => {
                          setAcceptedPayments((prev) =>
                            checked ? [...prev, key] : prev.filter((p) => p !== key)
                          );
                        }}
                      />
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium text-foreground">{label}</span>
                    </label>
                  ))}
                </div>
              </div>

            </div>
          </TabsContent>

          {/* ── PROMOS ── */}
          <TabsContent value="promos">
            <div className="pt-2">
              {restaurantId && <PromoCodeManager restaurantId={restaurantId} />}
            </div>
          </TabsContent>

          {/* ── STATS ── */}
          <TabsContent value="stats">
            <div className="pt-2">
              {restaurantId && <AdvancedStats restaurantId={restaurantId} />}
            </div>
          </TabsContent>

          {/* ── QR CODE ── */}
          <TabsContent value="qr">
            <div className="space-y-4 pt-2 text-center">
              <p className="text-sm font-semibold text-foreground">QR Code de votre restaurant</p>
              {qrUrl && (
                <>
                  <div className="mx-auto w-48 h-48 rounded-xl border bg-card p-2 shadow-card">
                    {restaurantQrDataUrl ? (
                      <img src={restaurantQrDataUrl} alt="QR" className="w-full h-full" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-muted-foreground">
                        <Loader2 className="h-6 w-6 animate-spin" />
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground break-all">{qrUrl}</p>
                  <button onClick={downloadQrCode} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">
                    <Download className="h-4 w-4" /> Télécharger
                  </button>
                </>
              )}
            </div>
          </TabsContent>

          {/* ── SECURITY (2FA) ── */}
          <TabsContent value="security">
            <div className="space-y-4 pt-2">
              <TwoFactorSetup />
            </div>
          </TabsContent>

          {/* ── COMPANY INFO ── */}
          <TabsContent value="company">
            <div className="space-y-4 pt-2">
              <p className="text-xs text-muted-foreground">Ces informations apparaîtront sur vos exports TVA (CSV, Excel, PDF).</p>
              <div>
                <Label className="text-xs font-semibold">Nom de société</Label>
                <Input value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Ex: SPRL RZ Food" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs font-semibold">Numéro de TVA</Label>
                <Input value={vatNumber} onChange={e => setVatNumber(e.target.value)} placeholder="Ex: BE0123.456.789" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs font-semibold">Adresse société</Label>
                <Input value={companyAddress} onChange={e => setCompanyAddress(e.target.value)} placeholder="Rue, numéro, code postal, ville" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs font-semibold">Email</Label>
                <Input type="email" value={companyEmail} onChange={e => setCompanyEmail(e.target.value)} placeholder="contact@example.com" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs font-semibold">Téléphone</Label>
                <Input value={companyPhone} onChange={e => setCompanyPhone(e.target.value)} placeholder="+32 xxx xx xx xx" className="mt-1" />
              </div>
              <button
                onClick={async () => {
                  const { error } = await supabase.from("restaurants").update({
                    company_name: companyName || null,
                    vat_number: vatNumber || null,
                    company_address: companyAddress || null,
                    company_email: companyEmail || null,
                    company_phone: companyPhone || null,
                  }).eq("id", restaurantId!);
                  if (error) { safeToast.error("Erreur sauvegarde"); return; }
                  queryClient.invalidateQueries({ queryKey: ["company-info"] });
                  safeToast.success("Infos société enregistrées");
                }}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground"
              >
                <Save className="h-4 w-4" /> Enregistrer infos société
              </button>
            </div>
          </TabsContent>
        </Tabs>

        <button onClick={() => mutation.mutate()} disabled={mutation.isPending}
          className="fixed bottom-20 left-4 right-4 z-30 flex items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground shadow-float disabled:opacity-60">
          {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Sauvegarder
        </button>
      </div>

      {/* Category selection popup */}
      {showCategoryPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-md max-h-[80vh] rounded-2xl bg-card shadow-elevated flex flex-col">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h3 className="text-sm font-bold text-foreground">Sélectionner les catégories</h3>
              <button onClick={() => setShowCategoryPopup(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <div className="grid grid-cols-2 gap-2">
                {ALL_CUISINE_CATEGORIES.map((cat) => {
                  const selected = tempCategories.includes(cat);
                  return (
                    <button
                      key={cat}
                      onClick={() => setTempCategories(prev => selected ? prev.filter(c => c !== cat) : [...prev, cat])}
                      className={`rounded-xl border p-2.5 text-xs font-semibold text-left transition-colors ${
                        selected ? "border-primary bg-primary/10 text-primary" : "border-border text-foreground hover:bg-accent"
                      }`}
                    >
                      {selected && "✓ "}{cat}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex gap-2 border-t px-4 py-3">
              <button onClick={() => setShowCategoryPopup(false)}
                className="flex-1 rounded-xl border py-2.5 text-xs font-semibold text-foreground hover:bg-accent">
                Annuler
              </button>
              <button onClick={() => { setCuisineCategories(tempCategories); setShowCategoryPopup(false); }}
                className="flex-1 rounded-xl bg-primary py-2.5 text-xs font-bold text-primary-foreground">
                Enregistrer ({tempCategories.length})
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
};

export default RestaurantSettings;
