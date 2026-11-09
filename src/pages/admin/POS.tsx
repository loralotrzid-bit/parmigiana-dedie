import { menuBasePrice } from "../../../supabase/functions/_shared/menuPricing";
import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/useAuth";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { fetchMenuByRestaurantId, fetchProductOptionGroups } from "@/services/menuService";
import type { Tables } from "@/integrations/supabase/types";
import { printOrderTicket, getAutoPrintEnabled, setAutoPrintEnabled, type PrintableOrder } from "@/services/printService";
import { createOrder } from "@/services/orderService";
import { fetchPhoneDeliveryRates, type PhoneDeliveryRate } from "@/services/phoneDeliveryRatesService";
import { safeToast } from "@/lib/safeToast";
import {
  ArrowLeft, Plus, Minus, Trash2, ShoppingBag, Printer,
  CreditCard, Banknote, X, PackageOpen, UtensilsCrossed,
  Truck, Store, Loader2, Check, Phone,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// ─── Types ──────────────────────────────────────────────────
interface TicketItem {
  id: string; // unique line id
  product_id: string;
  product_name: string;
  unit_price: number;
  quantity: number;
  options: { name: string; price: number }[];
  isDivers?: boolean;
}

type PosProduct = Tables<"products">;
type PosOptionGroup = Awaited<ReturnType<typeof fetchProductOptionGroups>>[number];
type PosOption = PosOptionGroup["options"][number];

type ServiceType = "dine_in" | "takeaway" | "delivery";
type PaymentMethod = "cash" | "card_counter";
type PhoneSetupStep = "phone" | "fulfillment" | "delivery" | null;

// ─── Helpers ────────────────────────────────────────────────
let lineIdCounter = 0;
const nextLineId = () => `line_${++lineIdCounter}_${Date.now()}`;

const SERVICE_TYPES: { value: ServiceType; label: string; icon: typeof Store }[] = [
  { value: "dine_in", label: "Sur place", icon: UtensilsCrossed },
  { value: "takeaway", label: "À emporter", icon: ShoppingBag },
  { value: "delivery", label: "Livraison", icon: Truck },
];

// ─── Component ──────────────────────────────────────────────
const POS = () => {
  const { restaurantId } = useAuth();
  const navigate = useNavigate();

  // Restaurant info
  const { data: restaurant } = useQuery({
    queryKey: ["pos-restaurant", restaurantId],
    queryFn: async () => {
      const { data } = await supabase.from("restaurants").select("*").eq("id", restaurantId!).single();
      return data as typeof data & { digital_menu_enabled: boolean; takeaway_discount: number };
    },
    enabled: !!restaurantId,
    staleTime: Infinity,
  });

  // Menu data
  const { data: categories, isLoading: menuLoading } = useQuery({
    queryKey: ["pos-menu", restaurantId],
    queryFn: () => fetchMenuByRestaurantId(restaurantId!, false),
    enabled: !!restaurantId,
  });

  // ─── Local state (ultra-fast, no API) ───
  const [selectedCatId, setSelectedCatId] = useState<string | null>(null);
  const [ticket, setTicket] = useState<TicketItem[]>([]);
  const [serviceType, setServiceType] = useState<ServiceType>("dine_in");
  const [showDivers, setShowDivers] = useState(false);
  const [diversName, setDiversName] = useState("");
  const [diversPrice, setDiversPrice] = useState("");
  const [showPayment, setShowPayment] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ─── Product options modal state ───
  const [optionModalProduct, setOptionModalProduct] = useState<PosProduct | null>(null);
  const [optionGroups, setOptionGroups] = useState<PosOptionGroup[]>([]);
  const [optionSelections, setOptionSelections] = useState<Record<string, { name: string; price: number }[]>>({});
  const [optionLoading, setOptionLoading] = useState(false);
  const [phoneMode, setPhoneMode] = useState(false);
  const [phoneSetupStep, setPhoneSetupStep] = useState<PhoneSetupStep>(null);
  const phoneDeliveryRatesQuery = useQuery<PhoneDeliveryRate[]>({
    queryKey: ["phone-delivery-rates", restaurantId],
    queryFn: () => fetchPhoneDeliveryRates(restaurantId!),
    enabled: !!restaurantId && phoneMode && serviceType === "delivery",
  });
  const [phoneNumber, setPhoneNumber] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [phoneAddress, setPhoneAddress] = useState("");
  const [deliveryPostcode, setDeliveryPostcode] = useState("");
  const [deliveryLocality, setDeliveryLocality] = useState("");
  const [deliveryLookup, setDeliveryLookup] = useState("");
  const [phoneLookupDone, setPhoneLookupDone] = useState(false);
  const [phoneCustomerFound, setPhoneCustomerFound] = useState(false);
  const [phoneLookupBusy, setPhoneLookupBusy] = useState(false);
  const [phoneLookupError, setPhoneLookupError] = useState("");
  const [savedPhoneAddresses, setSavedPhoneAddresses] = useState<{ address: string; postcode: string; locality: string }[]>([]);
  const [selectedPhoneAddress, setSelectedPhoneAddress] = useState("");
  const paymentLock = useRef(false);
  const phoneAttempt = useRef<{ signature: string; id: string } | null>(null);
  const [autoPrint, setAutoPrint] = useState(() => getAutoPrintEnabled());

  // Auto-select first category
  useEffect(() => {
    if (categories && categories.length > 0 && !selectedCatId) {
      setSelectedCatId(categories[0].id);
    }
  }, [categories, selectedCatId]);

  const selectedCategory = useMemo(
    () => categories?.find((c) => c.id === selectedCatId),
    [categories, selectedCatId]
  );

  // ─── Ticket operations (< 200ms target) ───
  const addItemDirect = useCallback((product: PosProduct, options: { name: string; price: number }[]) => {
    setTicket((prev) => {
      if (options.length === 0) {
        const existing = prev.find((item) => item.product_id === product.id && !item.isDivers && item.options.length === 0);
        if (existing) return prev.map((item) => item.id === existing.id ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...prev, {
        id: nextLineId(),
        product_id: product.id,
        product_name: product.name,
        unit_price: Number(product.price),
        quantity: 1,
        options,
      }];
    });
  }, []);

  // Open option modal or add directly
  const handleProductClick = useCallback(async (product: PosProduct) => {
    // Check if product has option groups
    setOptionLoading(true);
    try {
      const groups = await fetchProductOptionGroups(product.id);
      if (groups && groups.length > 0) {
        setOptionModalProduct(product);
        setOptionGroups(groups);
        // Pre-select first option for required single-select groups
        const initialSelections: Record<string, { name: string; price: number }[]> = {};
        groups.forEach((group) => {
          if (group.is_required && group.selection_type === "single" && group.options.length > 0) {
            initialSelections[group.id] = [{ name: group.options[0].name, price: Number(group.options[0].price_supplement || 0) }];
          }
        });
        setOptionSelections(initialSelections);
        setOptionLoading(false);
        return;
      }
    } catch {
      // If fetch fails, just add without options
    }
    setOptionLoading(false);
    addItemDirect(product, []);
  }, [addItemDirect]);

  const confirmProductOptions = useCallback(() => {
    if (!optionModalProduct) return;
    // Validate required groups
    for (const g of optionGroups) {
      if (g.is_required) {
        const sel = optionSelections[g.id] || [];
        if (sel.length < (g.min_selections || 1)) {
          safeToast.error(`Veuillez choisir: ${g.name}`);
          return;
        }
      }
    }
    const allOptions = Object.values(optionSelections).flat();
    addItemDirect(optionModalProduct, allOptions);
    setOptionModalProduct(null);
    setOptionGroups([]);
    setOptionSelections({});
  }, [optionModalProduct, optionGroups, optionSelections, addItemDirect]);

  const toggleOption = useCallback((groupId: string, option: PosOption, selectionType: string) => {
    setOptionSelections((prev) => {
      const current = prev[groupId] || [];
      const optEntry = { name: option.name, price: Number(option.price_supplement || 0) };
      if (selectionType === "single") {
        return { ...prev, [groupId]: [optEntry] };
      }
      // Multiple
      const exists = current.find((o) => o.name === option.name);
      if (exists) {
        return { ...prev, [groupId]: current.filter((o) => o.name !== option.name) };
      }
      return { ...prev, [groupId]: [...current, optEntry] };
    });
  }, []);

  const addDivers = useCallback(() => {
    const price = parseFloat(diversPrice);
    if (!diversName.trim() || isNaN(price) || price <= 0) {
      safeToast.error("Nom et prix requis");
      return;
    }
    setTicket((prev) => [
      ...prev,
      {
        id: nextLineId(),
        product_id: `divers_${Date.now()}`,
        product_name: diversName.trim(),
        unit_price: price,
        quantity: 1,
        options: [],
        isDivers: true,
      },
    ]);
    setDiversName("");
    setDiversPrice("");
    setShowDivers(false);
  }, [diversName, diversPrice]);

  const updateQuantity = useCallback((lineId: string, delta: number) => {
    setTicket((prev) =>
      prev
        .map((i) => (i.id === lineId ? { ...i, quantity: i.quantity + delta } : i))
        .filter((i) => i.quantity > 0)
    );
  }, []);

  const removeLine = useCallback((lineId: string) => {
    setTicket((prev) => prev.filter((i) => i.id !== lineId));
  }, []);

  const clearTicket = useCallback(() => setTicket([]), []);

  const priceForItem = (item: TicketItem) => {
    const product = categories?.flatMap(c => c.products || []).find(p => p.id === item.product_id);
    return product ? menuBasePrice(Number(product.price), serviceType, !!restaurant?.digital_menu_enabled, Number(restaurant?.takeaway_discount || 0)) : item.unit_price;
  };
  const pricedTicket = ticket.map(item => ({ ...item, unit_price: priceForItem(item) }));
  const phoneDeliveryRates = phoneDeliveryRatesQuery.data || [];
  const postcodeRate = /^\d{4}$/.test(deliveryPostcode)
    ? phoneDeliveryRates.find(rate => rate.postcode === deliveryPostcode && rate.is_active)
    : undefined;
  const phoneDeliveryFee = phoneMode && serviceType === "delivery" && /^\d{4}$/.test(deliveryPostcode)
    ? Number(postcodeRate?.fee ?? restaurant?.phone_delivery_fallback_fee ?? 15)
    : 0;
  const matchingDeliveryRates = phoneDeliveryRates.filter((rate) => rate.is_active && (
    rate.postcode.includes(deliveryLookup.trim()) || rate.locality.toLocaleLowerCase().includes(deliveryLookup.trim().toLocaleLowerCase())
  ));

  const startPhoneOrder = () => {
    if (phoneMode) {
      setPhoneMode(false);
      setPhoneSetupStep(null);
      setPhoneNumber("");
      setCustomerName("");
      setPhoneAddress("");
      setDeliveryPostcode("");
      setDeliveryLocality("");
      setDeliveryLookup("");
      setPhoneLookupDone(false); setPhoneCustomerFound(false); setSavedPhoneAddresses([]); setSelectedPhoneAddress(""); setPhoneLookupError("");
      return;
    }
    setPhoneMode(true);
    setServiceType("takeaway");
    setPhoneSetupStep("phone");
    setPhoneNumber("");
    setCustomerName("");
    setPhoneAddress("");
    setDeliveryPostcode("");
    setDeliveryLocality("");
    setDeliveryLookup("");
    setPhoneLookupDone(false); setPhoneCustomerFound(false); setSavedPhoneAddresses([]); setSelectedPhoneAddress(""); setPhoneLookupError("");
  };

  const lookupPhoneCustomer = async () => {
    const raw = phoneNumber.trim();
    const digits = raw.replace(/\D/g, "");
    if (digits.length < 8) { safeToast.error("Saisissez un numéro valide pour rechercher le client."); return; }
    setPhoneLookupBusy(true); setPhoneLookupError(""); setSavedPhoneAddresses([]);
    try {
      const variants = [...new Set([raw, digits, `+${digits}`, digits.startsWith("0") ? `+32${digits.slice(1)}` : raw])];
      const { data, error } = await supabase.from("orders").select("client_phone,delivery_address,delivery_postcode,note,created_at").eq("restaurant_id", restaurantId!).in("client_phone", variants).order("created_at", { ascending: false }).limit(30);
      if (error) throw error;
      setPhoneCustomerFound(!!data?.length);
      const addresses = (data || []).filter(row => row.delivery_address?.trim()).map(row => ({ address: row.delivery_address!.trim(), postcode: row.delivery_postcode || "", locality: "" }));
      setSavedPhoneAddresses(addresses.filter((item, i, all) => all.findIndex(x => x.address === item.address && x.postcode === item.postcode) === i));
      const firstName = data?.find(row => row.note?.includes("Commande téléphonique"))?.note?.match(/Commande téléphonique\s*-?\s*(.*?)\s*-\s*(?:Livraison|Paiement)/)?.[1]?.trim();
      if (firstName) setCustomerName(firstName);
      setPhoneLookupDone(true);
    } catch (error) {
      setPhoneLookupError("Recherche impossible pour le moment. Vous pouvez continuer en nouveau client.");
    } finally { setPhoneLookupBusy(false); }
  };

  const choosePhoneFulfillment = (type: "takeaway" | "delivery") => {
    setServiceType(type);
    if (type === "delivery") {
      const saved = savedPhoneAddresses.find(item => item.address === selectedPhoneAddress) || (savedPhoneAddresses.length === 1 ? savedPhoneAddresses[0] : undefined);
      if (saved) { setPhoneAddress(saved.address); setDeliveryPostcode(saved.postcode); setDeliveryLookup(saved.postcode); }
      setPhoneSetupStep("delivery");
      return;
    }
    setPhoneAddress("");
    setDeliveryPostcode("");
    setDeliveryLocality("");
    setDeliveryLookup("");
    setPhoneSetupStep(null);
  };

  const updateDeliveryLookup = (value: string) => {
    const cleanValue = value.trimStart();
    setDeliveryLookup(cleanValue);
    if (/^\d{4}$/.test(cleanValue)) {
      setDeliveryPostcode(cleanValue);
      const match = phoneDeliveryRates.find((rate) => rate.postcode === cleanValue && rate.is_active);
      setDeliveryLocality(match?.locality || "");
    } else {
      const match = phoneDeliveryRates.find((rate) => rate.is_active && rate.locality.toLocaleLowerCase() === cleanValue.toLocaleLowerCase());
      if (match) {
        setDeliveryPostcode(match.postcode);
        setDeliveryLocality(match.locality);
      } else {
        setDeliveryPostcode("");
        setDeliveryLocality("");
      }
    }
  };

  const confirmPhoneDelivery = () => {
    if (phoneDeliveryRatesQuery.isPending || phoneDeliveryRatesQuery.isError) return;
    if (!/^\d{4}$/.test(deliveryPostcode)) {
      safeToast.error("Choisissez une localité de la grille ou saisissez un code postal à 4 chiffres.");
      return;
    }
    if (!phoneAddress.trim()) {
      safeToast.error("Renseignez l’adresse complète de livraison.");
      return;
    }
    setDeliveryLookup(deliveryLocality || deliveryPostcode);
    setPhoneSetupStep(null);
  };
  const ticketTotal = useMemo(
    () =>
      pricedTicket.reduce(
        (sum, i) =>
          sum +
          i.quantity *
            (i.unit_price + i.options.reduce((s, o) => s + o.price, 0)),
        phoneDeliveryFee
      ),
    [pricedTicket, phoneDeliveryFee]
  );

  // ─── Submit order ───
  const handlePayment = async (method: PaymentMethod) => {
    if (ticket.length === 0 || paymentLock.current) return;
    if (phoneMode && (!/^[+\d\s().-]{8,25}$/.test(phoneNumber.trim()) || phoneNumber.replace(/\D/g, "").length < 8)) { safeToast.error("Renseignez un numéro de téléphone valide."); return; }
    if (phoneMode && serviceType === "delivery" && !phoneAddress.trim()) { safeToast.error("Renseignez l’adresse de livraison."); return; }
    if (phoneMode && serviceType === "delivery" && !/^\d{4}$/.test(deliveryPostcode)) { safeToast.error("Renseignez un code postal belge à 4 chiffres."); return; }
    if (phoneMode && serviceType === "delivery" && (phoneDeliveryRatesQuery.isPending || phoneDeliveryRatesQuery.isError)) { safeToast.error("Les tarifs de livraison n’ont pas pu être vérifiés. Réessayez."); return; }
    paymentLock.current = true;
    setIsSubmitting(true);
    try {
      const items = pricedTicket.map((i) => ({
        id: i.id,
        restaurant_id: restaurantId!,
        product_id: i.product_id,
        product_name: i.product_name,
        quantity: i.quantity,
        unit_price: i.unit_price,
        options: i.options.map((o) => ({ name: o.name, price: o.price })),
      }));

      const signature = JSON.stringify([items, serviceType, phoneNumber, customerName, phoneAddress, deliveryPostcode, method]);
      if (phoneMode && phoneAttempt.current?.signature !== signature) phoneAttempt.current = { signature, id: crypto.randomUUID() };
      const order = await createOrder(restaurantId!, items, serviceType, {
        requestId: phoneMode ? phoneAttempt.current!.id : undefined,
        paymentMethod: method,
        orderSource: phoneMode ? "phone" : "pos",
        clientPhone: phoneMode ? phoneNumber.trim() : undefined,
        deliveryAddress: phoneMode && serviceType === "delivery" ? phoneAddress.trim() : undefined,
        deliveryPostcode: phoneMode && serviceType === "delivery" ? deliveryPostcode : undefined,
        note: phoneMode ? `Commande téléphonique${customerName.trim() ? " - " + customerName.trim() : ""}${serviceType === "delivery" ? ` - Livraison ${deliveryLocality || deliveryPostcode}` : ""} - Paiement ${serviceType === "delivery" ? "à la livraison" : "au retrait"}` : `POS — ${method === "cash" ? "Espèces" : "Carte"}`,
      });

      // Print receipt
      const printableOrder: PrintableOrder = {
        order_number: order.order_number,
        created_at: order.created_at,
        order_type: serviceType,
        total: order.total,
        payment_status: phoneMode ? "unpaid" : "paid",
        client_phone: phoneMode ? phoneNumber.trim() : null,
        note: phoneMode ? `Commande téléphonique - ${customerName.trim()}${serviceType === "delivery" ? ` - Livraison ${deliveryLocality || deliveryPostcode}` : ""}` : null,
        delivery_address: phoneMode && serviceType === "delivery" ? phoneAddress.trim() : null,
        payment_method: method,
        items: pricedTicket.map((i) => ({
          product_name: i.product_name,
          quantity: i.quantity,
          unit_price: i.unit_price,
          total_price: i.quantity * (i.unit_price + i.options.reduce((s, o) => s + o.price, 0)),
          choices: i.options.map((o) => ({ option_name: o.name, price_supplement: o.price })),
        })),
      };
      if (autoPrint) {
        printOrderTicket(printableOrder, { restaurantName: restaurant?.name || "Restaurant" });
      }

      safeToast.success(`Commande #${order.order_number} validée !`);
      clearTicket();
      phoneAttempt.current = null;
      setPhoneNumber(""); setCustomerName(""); setPhoneAddress(""); setDeliveryPostcode("");
      setShowPayment(false);
    } catch (error) {
      safeToast.error(error instanceof Error ? error.message : "Erreur lors de la création de la commande");
    } finally {
      paymentLock.current = false;
      setIsSubmitting(false);
    }
  };

  // ─── UI ───────────────────────────────────────────────────
  if (!restaurantId) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">Non autorisé</p>
      </div>
    );
  }

  return (
    <div className="flex h-[100dvh] flex-col bg-background">
      {/* Top bar */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b bg-card px-3">
        <div className="flex items-center gap-3">
          <Link to="/admin" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <span className="text-lg font-extrabold text-primary">CAISSE</span>
          <span className="text-sm font-semibold text-muted-foreground">{restaurant?.name}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const next = !autoPrint;
              setAutoPrint(next);
              setAutoPrintEnabled(next);
              safeToast.success(next ? "Impression auto activée" : "Impression auto désactivée");
            }}
            className={`flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-bold transition-colors ${
              autoPrint
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-secondary"
            }`}
            title="Impression automatique"
          >
            <Printer className="h-3.5 w-3.5" />
            Auto
          </button>
          <div className="h-6 w-px bg-border" />
          {!phoneMode && SERVICE_TYPES.filter(({value}) => (value !== "delivery" || restaurant?.delivery_mode !== "disabled") && (value !== "dine_in" || restaurant?.dine_in_enabled)).map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              onClick={() => setServiceType(value)}
              className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                serviceType === value
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-secondary"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
      </header>

      <div className="border-b bg-card p-3 space-y-3">
        <button disabled={isSubmitting} onClick={startPhoneOrder} className={`rounded-xl px-4 py-3 font-bold flex items-center gap-2 ${phoneMode ? "bg-primary text-primary-foreground" : "border"}`}><Phone size={18}/>{phoneMode ? "Commande téléphonique active · Modifier" : "Saisir une commande téléphonique"}</button>
        {phoneMode && <><p className="text-sm text-muted-foreground">{serviceType === "delivery" ? `Livraison · ${deliveryLocality || deliveryPostcode} · ${phoneDeliveryFee.toFixed(2)} €` : "À emporter"} — La commande sera transmise en attente et restera non payée jusqu’au règlement.</p><div className="grid sm:grid-cols-2 gap-3"><label className="text-sm">Téléphone du client *<input type="tel" maxLength={25} value={phoneNumber} onChange={e => setPhoneNumber(e.target.value)} className="block w-full border rounded-lg p-2 bg-background" /></label><label className="text-sm">Nom du client (facultatif)<input maxLength={80} value={customerName} onChange={e => setCustomerName(e.target.value)} className="block w-full border rounded-lg p-2 bg-background" /></label></div></>}
      </div>

      {phoneSetupStep && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4" role="presentation">
          <section role="dialog" aria-modal="true" aria-labelledby="phone-order-setup-title" className="w-full max-w-lg rounded-2xl bg-card p-5 shadow-2xl">
            {phoneSetupStep === "phone" ? <>
              <h2 id="phone-order-setup-title" className="text-xl font-extrabold">Numéro du client</h2>
              <p className="mt-1 text-sm text-muted-foreground">Nous recherchons ses commandes précédentes chez La Parmigiana.</p>
              <label className="mt-4 block text-sm font-medium">Téléphone
                <input autoFocus type="tel" maxLength={25} value={phoneNumber} onChange={e => { setPhoneNumber(e.target.value); setPhoneLookupDone(false); }} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); void lookupPhoneCustomer(); } }} className="mt-1 block w-full rounded-lg border bg-background p-3" />
              </label>
              <button disabled={phoneLookupBusy} onClick={() => void lookupPhoneCustomer()} className="mt-3 w-full rounded-lg border py-2 font-semibold">{phoneLookupBusy ? "Recherche…" : "Rechercher le client"}</button>
              {phoneLookupError && <div className="mt-2 space-y-2"><p role="alert" className="text-sm text-destructive">{phoneLookupError}</p><button onClick={() => { setPhoneCustomerFound(false); setPhoneLookupDone(true); }} className="w-full rounded-lg border py-2 font-semibold">Continuer sans recherche</button></div>}
              {phoneLookupDone && <div className="mt-3 rounded-xl bg-muted p-3 text-sm"><p className="font-semibold">{phoneCustomerFound ? "Client reconnu" : "Nouveau client"}</p>{phoneCustomerFound && <><p className="mt-1">{customerName || "Client Parmigiana"} · {phoneNumber}</p>{savedPhoneAddresses.length > 0 && <label className="mt-3 block">Adresse habituelle<select value={selectedPhoneAddress || savedPhoneAddresses[0].address} onChange={e => setSelectedPhoneAddress(e.target.value)} className="mt-1 w-full rounded-lg border bg-background p-2">{savedPhoneAddresses.map(item => <option key={`${item.postcode}:${item.address}`} value={item.address}>{item.address}{item.postcode ? ` · ${item.postcode}` : ""}</option>)}</select></label>}</>}
                <button onClick={() => setPhoneSetupStep("fulfillment")} className="mt-3 w-full rounded-lg bg-primary py-3 font-bold text-primary-foreground">Continuer la commande</button>
              </div>}
              <button onClick={startPhoneOrder} className="mt-4 w-full rounded-lg border py-2 text-sm">Annuler</button>
            </> : phoneSetupStep === "fulfillment" ? <>
              <h2 id="phone-order-setup-title" className="text-xl font-extrabold">Commande téléphonique</h2>
              <p className="mt-1 text-sm text-muted-foreground">{customerName ? `Client : ${customerName} · ${phoneNumber}` : `Téléphone : ${phoneNumber}`} · Choisissez le mode de remise.</p>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <button onClick={() => choosePhoneFulfillment("takeaway")} className="flex min-h-28 flex-col items-center justify-center gap-2 rounded-xl border-2 p-4 font-bold hover:border-primary hover:bg-primary/5"><ShoppingBag className="h-7 w-7"/>À emporter</button>
                <button onClick={() => choosePhoneFulfillment("delivery")} className="flex min-h-28 flex-col items-center justify-center gap-2 rounded-xl border-2 p-4 font-bold hover:border-primary hover:bg-primary/5"><Truck className="h-7 w-7"/>Livraison<span className="text-xs font-normal text-muted-foreground">Commande prise par téléphone</span></button>
              </div>
              <button onClick={startPhoneOrder} className="mt-4 w-full rounded-lg border py-2 text-sm font-semibold">Annuler</button>
            </> : <>
              <div className="flex items-start justify-between gap-3">
                <div><h2 id="phone-order-setup-title" className="text-xl font-extrabold">Adresse de livraison</h2><p className="mt-1 text-sm text-muted-foreground">Saisissez une localité ou un code postal. Le tarif est calculé avant la commande.</p></div>
                <button aria-label="Annuler la commande téléphonique" onClick={startPhoneOrder} className="rounded-lg p-2 hover:bg-muted"><X className="h-5 w-5"/></button>
              </div>
              <label className="mt-4 block text-sm font-medium">Localité ou code postal
                <input autoFocus value={deliveryLookup} onChange={(e) => updateDeliveryLookup(e.target.value)} placeholder="Ex. Charleroi ou 6000" maxLength={80} className="mt-1 block w-full rounded-lg border bg-background p-3" />
              </label>
              {phoneDeliveryRatesQuery.isPending && <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin"/>Chargement des zones et tarifs…</p>}
              {phoneDeliveryRatesQuery.isError && <p role="alert" className="mt-2 text-sm text-destructive">Impossible de vérifier les tarifs. Réessayez avant de continuer.</p>}
              {!phoneDeliveryRatesQuery.isPending && !phoneDeliveryRatesQuery.isError && deliveryLookup.trim() && matchingDeliveryRates.length > 0 && (
                <div className="mt-2 max-h-36 space-y-1 overflow-y-auto rounded-lg border p-1" aria-label="Localités disponibles">
                  {matchingDeliveryRates.slice(0, 8).map((rate) => <button key={rate.id} onClick={() => { setDeliveryPostcode(rate.postcode); setDeliveryLocality(rate.locality); setDeliveryLookup(rate.locality); }} className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-muted ${deliveryPostcode === rate.postcode ? "bg-primary/10 font-bold" : ""}`}><span>{rate.locality} · {rate.postcode}</span><span>{Number(rate.fee).toFixed(2)} €</span></button>)}
                </div>
              )}
              {!phoneDeliveryRatesQuery.isPending && !phoneDeliveryRatesQuery.isError && /^\d{4}$/.test(deliveryPostcode) && (
                <p className="mt-2 rounded-lg bg-muted p-3 text-sm">{postcodeRate?.locality || "Code postal hors grille"} · Frais de livraison : <strong>{phoneDeliveryFee.toFixed(2)} €</strong>{!postcodeRate && <span className="block text-xs text-muted-foreground">Tarif hors zone défini par l’administration</span>}</p>
              )}
              <label className="mt-3 block text-sm font-medium">Adresse complète *
                <input value={phoneAddress} onChange={(e) => setPhoneAddress(e.target.value)} maxLength={300} placeholder="Rue, numéro, étage…" className="mt-1 block w-full rounded-lg border bg-background p-3" />
              </label>
              <div className="mt-5 flex gap-2">
                <button onClick={() => setPhoneSetupStep("fulfillment")} className="rounded-lg border px-4 py-2 font-semibold">Retour</button>
                <button disabled={phoneDeliveryRatesQuery.isPending || phoneDeliveryRatesQuery.isError || !/^\d{4}$/.test(deliveryPostcode) || !phoneAddress.trim()} onClick={confirmPhoneDelivery} className="flex-1 rounded-lg bg-primary px-4 py-2 font-bold text-primary-foreground disabled:opacity-50">Confirmer la livraison · {phoneDeliveryFee.toFixed(2)} €</button>
              </div>
            </>}
          </section>
        </div>
      )}
      {/* Main area: 3 panels */}
      <div className="flex flex-1 overflow-hidden">
        {/* LEFT — Categories */}
        <aside className="w-28 shrink-0 overflow-y-auto border-r bg-card sm:w-36">
          {categories?.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCatId(cat.id)}
              className={`w-full border-b px-2 py-3 text-left text-xs font-bold transition-colors ${
                selectedCatId === cat.id
                  ? "bg-primary/10 text-primary border-l-4 border-l-primary"
                  : "text-foreground hover:bg-muted"
              }`}
            >
              {cat.name}
            </button>
          ))}
          {/* Divers button */}
          <button
            onClick={() => setShowDivers(true)}
            className="flex w-full items-center gap-1.5 border-b px-2 py-3 text-left text-xs font-bold text-warning hover:bg-warning/10"
          >
            <PackageOpen className="h-3.5 w-3.5" />
            Divers
          </button>
        </aside>

        {/* CENTER — Product grid */}
        <main className="flex-1 overflow-y-auto p-3">
          {menuLoading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {selectedCategory?.products
                ?.filter((product) => product.is_available)
                .map((product) => (
                  <button
                    key={product.id}
                    onClick={() => handleProductClick(product)}
                    disabled={optionLoading}
                    className="flex flex-col items-center justify-center rounded-xl border-2 border-border bg-card p-3 text-center shadow-sm transition-all hover:border-primary hover:shadow-md active:scale-95 disabled:opacity-50"
                    style={{ minHeight: 80 }}
                  >
                    <span className="text-sm font-bold text-foreground leading-tight line-clamp-2">
                      {product.name}
                    </span>
                    <span className="mt-1 text-base font-extrabold text-primary">
                      {menuBasePrice(Number(product.price), serviceType, !!restaurant?.digital_menu_enabled, Number(restaurant?.takeaway_discount || 0)).toFixed(2)}€
                    </span>
                  </button>
                ))}
            </div>
          )}
        </main>

        {/* RIGHT — Ticket */}
        <aside className="flex w-72 shrink-0 flex-col border-l bg-card sm:w-80 lg:w-96">
          {/* Ticket header */}
          <div className="flex items-center justify-between border-b px-3 py-2">
            <span className="text-sm font-extrabold text-foreground">
              Ticket ({ticket.length} article{ticket.length > 1 ? "s" : ""})
            </span>
            {ticket.length > 0 && (
              <button onClick={clearTicket} className="text-xs font-semibold text-destructive hover:underline">
                Vider
              </button>
            )}
          </div>

          {/* Ticket items */}
          <div className="flex-1 overflow-y-auto px-3 py-2">
            {ticket.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
                <ShoppingBag className="mb-2 h-8 w-8" />
                <p className="text-sm">Ticket vide</p>
              </div>
            ) : (
              <div className="space-y-2">
                {ticket.map((item) => (
                  <div
                    key={item.id}
                    className={`rounded-lg border p-2 ${item.isDivers ? "border-warning/30 bg-warning/5" : "border-border"}`}
                  >
                    <div className="flex items-start justify-between gap-1">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-foreground truncate">{item.product_name}</p>
                        {item.isDivers && (
                          <span className="text-[10px] font-semibold text-warning">DIVERS</span>
                        )}
                      </div>
                      <span className="text-sm font-extrabold text-foreground whitespace-nowrap">
                        {(item.quantity * (priceForItem(item) + item.options.reduce((s, o) => s + o.price, 0))).toFixed(2)}€
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <button
                        onClick={() => updateQuantity(item.id, -1)}
                        className="flex h-7 w-7 items-center justify-center rounded-md border bg-background text-foreground hover:bg-secondary"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="w-6 text-center text-sm font-extrabold text-foreground">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => updateQuantity(item.id, 1)}
                        className="flex h-7 w-7 items-center justify-center rounded-md border bg-background text-foreground hover:bg-secondary"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                      <span className="flex-1 text-right text-xs text-muted-foreground">
                        {priceForItem(item).toFixed(2)}€/u
                      </span>
                      <button
                        onClick={() => removeLine(item.id)}
                        className="text-destructive/60 hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Ticket footer */}
          <div className="border-t p-3 space-y-2">
            {phoneMode && serviceType === "delivery" && /^\d{4}$/.test(deliveryPostcode) && (
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>Livraison · {postcodeRate?.postcode || deliveryPostcode}</span>
                <span>{phoneDeliveryFee.toFixed(2)} €</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-lg font-extrabold text-foreground">TOTAL</span>
              <span className="text-2xl font-black text-primary">{ticketTotal.toFixed(2)}€</span>
            </div>
            <button
              onClick={() => ticket.length > 0 && setShowPayment(true)}
              disabled={ticket.length === 0 || isSubmitting}
              className="w-full rounded-xl bg-primary py-3.5 text-base font-extrabold text-primary-foreground disabled:opacity-40 shadow-md active:scale-[0.98] transition-transform"
            >
              {phoneMode ? "Confirmer la commande téléphonique" : "💳 Encaisser"}
            </button>
          </div>
        </aside>
      </div>

      {/* ─── Divers modal ─── */}
      {showDivers && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowDivers(false)}>
          <div className="w-80 rounded-2xl bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-extrabold text-foreground">Article divers</h3>
              <button onClick={() => setShowDivers(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Nom de l'article"
                value={diversName}
                onChange={(e) => setDiversName(e.target.value)}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm font-semibold text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                autoFocus
              />
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="Prix (€)"
                value={diversPrice}
                onChange={(e) => setDiversPrice(e.target.value)}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm font-semibold text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
              />
              <button
                onClick={addDivers}
                className="w-full rounded-xl bg-warning py-2.5 text-sm font-extrabold text-warning-foreground"
              >
                Ajouter au ticket
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Payment modal ─── */}
      <AlertDialog open={showPayment} onOpenChange={setShowPayment}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{phoneMode ? "Confirmer la commande téléphonique" : "Encaisser"} · {ticketTotal.toFixed(2)}€</AlertDialogTitle>
            <AlertDialogDescription>{phoneMode ? `Choisissez le règlement prévu ${serviceType === "delivery" ? "à la livraison" : "au retrait"}. Aucun paiement n’est encaissé maintenant.` : "Choisissez le mode de paiement"}</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid grid-cols-2 gap-3 py-4">
            <button
              onClick={() => handlePayment("cash")}
              disabled={isSubmitting || !restaurant?.accepted_payments?.includes("cash")}
              className="flex flex-col items-center gap-2 rounded-xl border-2 border-border p-6 hover:border-primary hover:bg-primary/5 transition-colors disabled:opacity-50"
            >
              <Banknote className="h-10 w-10 text-success" />
              <span className="text-sm font-extrabold text-foreground">Espèces</span>
            </button>
            <button
              onClick={() => handlePayment("card_counter")}
              disabled={isSubmitting || serviceType === "delivery" || !restaurant?.accepted_payments?.includes("card_counter")}
              className="flex flex-col items-center gap-2 rounded-xl border-2 border-border p-6 hover:border-primary hover:bg-primary/5 transition-colors disabled:opacity-50"
            >
              <CreditCard className="h-10 w-10 text-primary" />
              <span className="text-sm font-extrabold text-foreground">Carte</span>
            </button>
          </div>
          {isSubmitting && (
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Validation en cours…
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>Annuler</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Product Options modal ─── */}
      {optionModalProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => { setOptionModalProduct(null); setOptionGroups([]); setOptionSelections({}); }}>
          <div className="w-[90vw] max-w-md max-h-[80vh] flex flex-col rounded-2xl bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between border-b px-4 py-3 shrink-0">
              <div>
                <h3 className="text-base font-extrabold text-foreground">{optionModalProduct.name}</h3>
                <p className="text-sm font-bold text-primary">{Number(optionModalProduct.price).toFixed(2)}€</p>
              </div>
              <button onClick={() => { setOptionModalProduct(null); setOptionGroups([]); setOptionSelections({}); }} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Option groups */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
              {optionGroups.map((group) => (
                <div key={group.id}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm font-extrabold text-foreground">{group.name}</span>
                    {group.is_required && (
                      <span className="text-[10px] font-bold bg-destructive/10 text-destructive px-1.5 py-0.5 rounded">Requis</span>
                    )}
                    <span className="text-[10px] text-muted-foreground">
                      {group.selection_type === "single" ? "1 choix" : `${group.min_selections || 0}-${group.max_selections || "∞"}`}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {group.options.map((opt) => {
                      const isSelected = (optionSelections[group.id] || []).some((option) => option.name === opt.name);
                      return (
                        <button
                          key={opt.id}
                          onClick={() => toggleOption(group.id, opt, group.selection_type)}
                          className={`flex items-center justify-between rounded-lg border-2 px-3 py-2 text-left text-sm font-semibold transition-all ${
                            isSelected
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border bg-background text-foreground hover:border-muted-foreground"
                          }`}
                        >
                          <span className="truncate">{opt.name}</span>
                          <div className="flex items-center gap-1 shrink-0">
                            {Number(opt.price_supplement || 0) > 0 && (
                              <span className="text-xs text-muted-foreground">+{Number(opt.price_supplement).toFixed(2)}€</span>
                            )}
                            {isSelected && <Check className="h-4 w-4 text-primary" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="border-t px-4 py-3 shrink-0">
              <button
                onClick={confirmProductOptions}
                className="w-full rounded-xl bg-primary py-3 text-sm font-extrabold text-primary-foreground shadow-md active:scale-[0.98] transition-transform"
              >
                Ajouter au ticket
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default POS;
