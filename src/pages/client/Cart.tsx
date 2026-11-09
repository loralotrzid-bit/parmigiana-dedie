import { ArrowLeft, Trash2, Minus, Plus, ShoppingBag, Loader2, MessageSquare, Truck, Store, UtensilsCrossed, Pencil, Clock } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";

import ClientLayout from "@/layouts/ClientLayout";
import { useCart } from "@/contexts/useCart";
import { useAuth } from "@/contexts/useAuth";
import { createOrder } from "@/services/orderService";
import { fetchRestaurantConfig } from "@/services/restaurantConfigService";
import { isDeliveryPaused } from "@/services/deliverySettingsService";
import CustomerInfoForm, { CustomerInfo } from "@/components/client/CustomerInfoForm";
import { readMenuSession, markMenuOrder } from "@/services/digitalMenuService";
import PaymentMethodSelector, { PaymentMethod } from "@/components/client/PaymentMethodSelector";
import CashDenominationSelector from "@/components/client/CashDenominationSelector";

import ProfileCompletion from "@/components/client/ProfileCompletion";
import CartSuggestions from "@/components/client/CartSuggestions";
import DeliveryInstructions from "@/components/client/DeliveryInstructions";
import { getSavedAddress } from "@/lib/savedAddress";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentSession, isValidSession } from "@/lib/authSession";
import ProductModal from "@/components/product/ProductModal";
import AuthModal from "@/components/client/AuthModal";
import { dbg } from "@/lib/debugLog";
type CheckoutStep = "cart" | "profile" | "payment";

const getStepFromQuery = (): CheckoutStep | null => {
  const step = new URLSearchParams(window.location.search).get("step");
  if (step === "cart" || step === "profile" || step === "payment") return step;
  return null;
};

const ORDER_TYPE_CONFIG: Record<string, { label: string; icon: typeof Truck; color: string }> = {
  delivery: { label: "Livraison", icon: Truck, color: "bg-primary/10 text-primary" },
  takeaway: { label: "À emporter", icon: Store, color: "bg-warning/10 text-warning" },
  dine_in: { label: "Sur place", icon: UtensilsCrossed, color: "bg-success/10 text-success" },
};

const Cart = () => {
  const { items, updateQuantity, removeItem, total, clearCart, orderType, currentRestaurantId, scheduledAt, isLoading: cartLoading } = useCart();
  const { isAdmin, session: authSession, user: authUser, isLoading: authLoading } = useAuth();
  const isAdminRef = useRef(isAdmin);
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [proceeding, setProceeding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // FREEZE step once — lazy initializer runs only on first render
  const hasInitializedRef = useRef(false);

  const [step, setStep] = useState<CheckoutStep>(() => {
    const urlStep = getStepFromQuery();
    if (urlStep) return urlStep;
    return "cart";
  });
  const stepRef = useRef<CheckoutStep>(step);
  const isOAuthResume = !!getStepFromQuery();
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
  const [cashDetails, setCashDetails] = useState<{ counts: Record<number, number>; total: number } | null>(null);
  const [deliveryInstruction, setDeliveryInstruction] = useState("hand");
  const [deliveryComment, setDeliveryComment] = useState("");
  // scheduledAt is now managed in CartContext
  const [orderNote, setOrderNote] = useState("");
  const [editingItem, setEditingItem] = useState<typeof items[0] | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [deliveryPausedMsg, setDeliveryPausedMsg] = useState(false);
  const handleOptionalContactChange = useCallback((info: CustomerInfo) => setCustomerInfo(info), []);

  const restaurantId = currentRestaurantId || (items.length > 0 ? items[0].restaurant_id : null);
  const menuSession = readMenuSession();
  const menuGuest = menuSession?.restaurant_id === restaurantId && !menuSession.order_id;

  const { data: restoConfig } = useQuery({
    queryKey: ["resto-config", restaurantId],
    queryFn: () => fetchRestaurantConfig(restaurantId!),
    enabled: !!restaurantId,
    staleTime: 60_000,
  });

  const otConfig = ORDER_TYPE_CONFIG[orderType] || ORDER_TYPE_CONFIG.takeaway;
  const OtIcon = otConfig.icon;

  const estimatedDeliveryFee = useMemo(() => {
    if (orderType !== "delivery" || !restoConfig) return 0;
    if (restoConfig.is_free_delivery) return 0;
    if (restoConfig.delivery_mode === "disabled") return 0;
    const flatFee = restoConfig.delivery_flat_fee || 0;
    if (restoConfig.delivery_mode === "flat") return flatFee;
    const savedAddr = getSavedAddress();
    let fee = flatFee;
    if (savedAddr?.lat && savedAddr?.lng && restoConfig.latitude && restoConfig.longitude) {
      const R = 6371;
      const dLat = (savedAddr.lat - restoConfig.latitude) * Math.PI / 180;
      const dLon = (savedAddr.lng - restoConfig.longitude) * Math.PI / 180;
      const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(restoConfig.latitude * Math.PI / 180) * Math.cos(savedAddr.lat * Math.PI / 180) *
        Math.sin(dLon / 2) ** 2;
      const km = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      if (restoConfig.delivery_free_under_km && km <= restoConfig.delivery_free_under_km) {
        return 0;
      }
      fee += (restoConfig.delivery_per_km_fee || 0) * km;
    }
    return Math.round(fee * 100) / 100;
  }, [orderType, restoConfig]);

  const finalTotal = Math.max(0, total + estimatedDeliveryFee);

  // Show blur overlay on recap while cart is still hydrating (e.g. after OAuth redirect)
  const isCartHydrating = cartLoading || (items.length === 0 && total === 0 && (authLoading || !!authSession));

  useEffect(() => {
    isAdminRef.current = isAdmin;
  }, [isAdmin]);

  useEffect(() => {
    stepRef.current = step;
  }, [step]);

  useEffect(() => {
    if (orderType !== "delivery" || !restaurantId) { setDeliveryPausedMsg(false); return; }
    isDeliveryPaused(restaurantId).then(setDeliveryPausedMsg);
  }, [orderType, restaurantId]);

  // Auto-resume cart flow after OAuth redirect — waits for auth context to settle
  useEffect(() => {
    if (hasInitializedRef.current) return;
    // Don't run until auth context is done loading
    if (authLoading) return;
    hasInitializedRef.current = true;

    const stepParam = getStepFromQuery();

    if (!stepParam || stepParam === "cart") {
      if (stepParam) window.history.replaceState({}, "", "/cart");
      return;
    }

    let cancelled = false;

    const resolveQuickly = async () => {
      const targetStep: CheckoutStep = stepParam === "payment" ? "payment" : "profile";

      // Use the auth context session directly — it's already resolved
      const session = authSession;

      if (cancelled) return;

      if (!isValidSession(session) || isAdminRef.current) {
        console.warn("[Cart resume] No session after callback, staying on cart");
        window.history.replaceState({}, "", "/cart");
        setStep("cart");
        return;
      }

      console.log("[Cart resume] Session OK →", targetStep);
      window.history.replaceState({}, "", "/cart");

      const nextStep = await resolveCheckoutStepFromProfile(session, targetStep);
      if (cancelled) return;
      setStep(nextStep);
    };

    void resolveQuickly();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading]);

  const redirectToCheckoutLogin = () => {
    navigate(`/auth/login?redirect=${encodeURIComponent("/cart?step=profile")}`, { replace: true });
  };

  const resolveCheckoutSession = async (timeoutMs = 1200): Promise<Session | null> => {
    dbg("session", "resolveCheckoutSession start", { timeoutMs });

    if (isValidSession(authSession)) {
      return authSession;
    }

    const session = await getCurrentSession({ timeoutMs, allowRefresh: true, allowStorageFallback: true });

    dbg("session", "resolveCheckoutSession result", { valid: isValidSession(session) });
    return isValidSession(session) ? session : null;
  };

  const resolveCheckoutStepFromProfile = async (
    session: Session,
    fallback: CheckoutStep = "profile"
  ): Promise<CheckoutStep> => {
    const savedAddr = getSavedAddress();

    const { data: profile, error } = await supabase
      .from("profiles")
      .select("display_name, phone")
      .eq("user_id", session.user.id)
      .maybeSingle();

    if (error && error.code !== "PGRST116") {
      console.warn("[Cart] Profile resolution failed:", error.message);
      return fallback;
    }

    const profileName = profile?.display_name?.trim() || "";
    const profilePhone = profile?.phone?.trim() || "";
    const hasCoreProfile = !!profileName && !!profilePhone;
    const needsDeliveryAddress = orderType === "delivery" && !savedAddr;

    if (!hasCoreProfile || needsDeliveryAddress) {
      return "profile";
    }

    setCustomerInfo({
      name: profileName,
      phone: profilePhone,
      email: session.user.email || "",
      address: savedAddr?.display_name,
      lat: savedAddr?.lat,
      lng: savedAddr?.lng,
    });

    return "payment";
  };

  const handleProceed = async () => {
    if (items.length === 0) return;
    if (menuGuest) { setStep("profile"); return; }
    setProceeding(true);
    dbg("checkout", "handleProceed started");
    

    try {
      // FIX: Check context session first — avoids LockManager timeout after first order
      let session: Session | null = authSession;
      dbg("checkout", "Context session", { valid: isValidSession(session) });

      if (!isValidSession(session)) {
        dbg("checkout", "Context session invalid, resolving checkout session...");
        session = await resolveCheckoutSession(1100);
        dbg("checkout", "Resolved session", { valid: isValidSession(session) });
      }

      if (!isValidSession(session) || isAdminRef.current) {
        dbg("checkout", "No valid session → showing auth modal", { isAdmin: isAdminRef.current });
        if (!showAuthModal) setShowAuthModal(true);
        return;
      }

      const nextStep = await resolveCheckoutStepFromProfile(session, "profile");
      dbg("checkout", "Resolved next step", { nextStep });
      setStep(nextStep);
    } finally {
      setProceeding(false);
    }
  };

  /** Called when Google auth completes inline (no redirect). */
  const handleInlineAuthenticated = async () => {
    const session = await resolveCheckoutSession(1400);

    if (isValidSession(session)) {
      console.log("[Cart] Inline auth OK");
      setShowAuthModal(false);
      const nextStep = await resolveCheckoutStepFromProfile(session, "profile");
      setStep(nextStep);
    } else {
      console.warn("[Cart] Inline auth unresolved");
    }
  };

  /** Called when user picks email login from the modal. */
  const handleEmailLoginRedirect = () => {
    setShowAuthModal(false);
    redirectToCheckoutLogin();
  };

  const handleProfileComplete = async (data: import("@/components/client/ProfileCompletion").ProfileData) => {
    const session = await resolveCheckoutSession(1200);

    setCustomerInfo({
      name: data.displayName,
      phone: data.phone,
      email: session?.user?.email || "",
      address: data.address,
      lat: data.lat,
      lng: data.lng,
    });
    setStep("payment");
  };

  const handleBack = () => {
    if (step === "payment") setStep("cart");
    else if (step === "profile") setStep("cart");
    else setStep("cart");
  };

  const handleOrder = async () => {
    const effectivePaymentMethod: PaymentMethod | null = menuGuest
      ? (restoConfig?.accepted_payments.includes("cash") ? "cash" : restoConfig?.accepted_payments.includes("card_counter") ? "card_counter" : null)
      : paymentMethod;
    if (submittingRef.current || items.length === 0 || !effectivePaymentMethod) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError(null);

    try {
      if (!restoConfig) throw new Error("Configuration du restaurant indisponible. Réessayez.");
      if (orderType === "delivery" && restoConfig.delivery_mode === "disabled") {
        throw new Error("La livraison n'est pas disponible pour ce restaurant");
      }
      if (!restoConfig.accepted_payments.includes(effectivePaymentMethod)) {
        throw new Error("Ce moyen de paiement n'est pas accepté par ce restaurant");
      }
      const effectiveRestaurantId = currentRestaurantId || (items.length > 0 ? items[0].restaurant_id : null);
      if (!effectiveRestaurantId) throw new Error("Restaurant inconnu");

      const tableNumber = sessionStorage.getItem("rzfood_table_number");
      const orderSource = sessionStorage.getItem("rzfood_order_source") || "direct";

      const noteParts = [
        customerInfo?.name ? `Client: ${customerInfo.name}` : "",
        orderNote,
        orderType === "delivery" ? deliveryInstruction : "",
        orderType === "delivery" ? deliveryComment : "",
      ].filter(Boolean).join(" | ");

      const order = await createOrder(effectiveRestaurantId, items, orderType, {
        orderSource,
        tableNumber: tableNumber ? parseInt(tableNumber) : undefined,
        paymentMethod: effectivePaymentMethod,
        cashDetails: !menuGuest && effectivePaymentMethod === "cash" ? cashDetails : undefined,
        deliveryAddress: customerInfo?.address,
        deliveryLat: customerInfo?.lat,
        deliveryLng: customerInfo?.lng,
        clientPhone: customerInfo?.phone,
        note: noteParts || undefined,
        scheduledAt: scheduledAt || undefined,
      });

      if (menuGuest) markMenuOrder(order.id);

      clearCart();
      sessionStorage.removeItem("rzfood_table_number");
      sessionStorage.removeItem("rzfood_order_source");
      sessionStorage.removeItem("rzfood_qr_seen");
      localStorage.setItem("rzfood_last_order_id", order.id);
      navigate(`/orders/${order.id}`);
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "Erreur lors de la commande");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <ClientLayout>
      <div className="animate-fade-in px-4 pt-4">
        {step !== "cart" && (
          <button onClick={handleBack} className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground">
            <ArrowLeft className="h-4 w-4" /> Retour
          </button>
        )}

        {step === "cart" && (
          <>
            <button onClick={() => navigate(-1)} className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground">
              <ArrowLeft className="h-4 w-4" /> Retour
            </button>
            {menuGuest && <button onClick={() => navigate(sessionStorage.getItem("parmigiana_menu_return") || "/menu/la-parmigiana?counter=1")} className="mb-4 ml-3 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold text-primary"><ArrowLeft className="h-4 w-4" /> Retour au {sessionStorage.getItem("parmigiana_menu_mode") === "dine_in" ? `menu de la table ${sessionStorage.getItem("rzfood_table_number") || ""}` : "menu comptoir"}</button>}
            <h1 className="mb-1 text-xl font-extrabold text-foreground">Votre panier</h1>

            {(deliveryPausedMsg || restoConfig?.delivery_mode === "disabled") && orderType === "delivery" && (
              <div className="mb-4 rounded-xl border-2 border-destructive/30 bg-destructive/5 p-4 text-center">
                <p className="text-sm font-bold text-destructive">🚫 Livraison temporairement indisponible.</p>
                <p className="text-xs text-muted-foreground mt-1">Vous pouvez commander à emporter.</p>
              </div>
            )}

            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">{items.length} article{items.length !== 1 ? "s" : ""}</span>
              <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${otConfig.color}`}>
                <OtIcon className="h-3.5 w-3.5" />
                {otConfig.label}
              </span>
              {scheduledAt && (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">
                  <Clock className="h-3.5 w-3.5" />
                  {new Date(scheduledAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                  {" — "}
                  {new Date(scheduledAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "long" })}
                </span>
              )}
            </div>

            {items.length === 0 ? (
              <div className="flex flex-col items-center py-20 text-muted-foreground">
                <ShoppingBag className="mb-3 h-10 w-10" />
                <p>Votre panier est vide</p>
              </div>
            ) : (
              <>
                <div className="space-y-3">
                  {items.map((item) => (
                    <div key={item.id} className="rounded-xl border bg-card p-3 shadow-card">
                      <div className="flex items-start justify-between">
                        <button
                          onClick={() => { if (!menuGuest) setEditingItem(item); }}
                          disabled={menuGuest}
                          className="flex-1 text-left"
                        >
                          <h3 className="text-sm font-semibold text-card-foreground flex items-center gap-1.5">
                            {item.product_name}
                            {!menuGuest && <Pencil className="h-3 w-3 text-muted-foreground" />}
                          </h3>
                          {item.options.length > 0 && (
                            <p className="mt-0.5 text-xs text-muted-foreground">{item.options.map((o) => o.name).join(", ")}</p>
                          )}
                          <p className="mt-1 text-xs font-semibold text-primary">{item.unit_price.toFixed(2)} €</p>
                        </button>
                        <button onClick={() => removeItem(item.id)} className="ml-2 text-muted-foreground hover:text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="mt-2 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <button onClick={() => updateQuantity(item.id, item.quantity - 1)}
                            className="flex h-7 w-7 items-center justify-center rounded-full border text-foreground transition-colors hover:bg-secondary">
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                          <span className="w-6 text-center text-sm font-bold text-foreground">{item.quantity}</span>
                          <button onClick={() => updateQuantity(item.id, item.quantity + 1)}
                            className="flex h-7 w-7 items-center justify-center rounded-full border text-foreground transition-colors hover:bg-secondary">
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <span className="text-sm font-bold text-foreground">{(item.unit_price * item.quantity).toFixed(2)} €</span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 rounded-xl border-2 border-dashed border-primary/20 bg-primary/5 p-4">
                  <label className="flex items-center gap-2 text-sm font-bold text-foreground mb-2">
                    <MessageSquare className="h-4 w-4 text-primary" />
                    Spécifications
                  </label>
                  <textarea
                    value={orderNote}
                    onChange={(e) => setOrderNote(e.target.value)}
                    placeholder="Allergies, cuisson, sans oignons, sans sauce…"
                    rows={2}
                    className="w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none resize-none focus:border-primary"
                  />
                </div>

                {menuGuest && <details className="mt-4 rounded-xl border bg-card p-4">
                  <summary className="cursor-pointer text-sm font-semibold text-foreground">Ajouter mes coordonnées (facultatif)</summary>
                  <div className="mt-3">
                    <CustomerInfoForm optionalContact inlineOptional initialValues={customerInfo || undefined}
                      onSubmit={handleOptionalContactChange}
                      onOptionalChange={handleOptionalContactChange} />
                  </div>
                </details>}

                {restaurantId && !menuGuest && <CartSuggestions restaurantId={restaurantId} />}

                <div className={`mt-4 rounded-xl border bg-card p-4 shadow-card relative transition-all duration-500 ${isCartHydrating ? 'blur-sm opacity-60' : ''}`}>
                  {isCartHydrating && (
                    <div className="absolute inset-0 flex items-center justify-center z-10">
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Sous-total</span>
                    <span className="font-medium text-foreground">{total.toFixed(2)} €</span>
                  </div>
                  {orderType === "delivery" && estimatedDeliveryFee > 0 && (
                    <div className="mt-1 flex justify-between text-sm">
                      <span className="text-muted-foreground">Frais de livraison</span>
                      <span className="font-medium text-foreground">{estimatedDeliveryFee.toFixed(2)} €</span>
                    </div>
                  )}
                  <div className="mt-3 flex justify-between border-t pt-3">
                    <span className="text-base font-bold text-foreground">Total</span>
                    <span className="text-base font-extrabold text-primary">{finalTotal.toFixed(2)} €</span>
                  </div>
                </div>

                <button onClick={handleProceed}
                  disabled={menuGuest ? proceeding || !restoConfig || !restoConfig.accepted_payments.some((method) => method === "cash" || method === "card_counter") || finalTotal <= 0 : proceeding || finalTotal <= 0}
                  className="mt-4 w-full rounded-xl bg-primary py-4 text-center text-base font-bold text-primary-foreground shadow-float transition-transform active:scale-[0.98] disabled:opacity-60">
                  {menuGuest
                    ? proceeding ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : `Continuer — ${finalTotal.toFixed(2)} €`
                    : proceeding ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : `Continuer — ${finalTotal.toFixed(2)} €`}
                </button>
              </>
            )}
          </>
        )}

        {step === "profile" && (
          menuGuest ? <div className="space-y-4">
            {orderType === "dine_in" && sessionStorage.getItem("rzfood_table_number") && <p className="rounded-xl border bg-card p-3 text-sm font-semibold">Commande pour la table {sessionStorage.getItem("rzfood_table_number")}</p>}
            <div className="rounded-xl border bg-card p-4 text-sm"><p className="font-semibold">La carte fidélité électronique arrive</p><p className="mt-1 text-muted-foreground">Après 11 pizzas achetées, la 12ᵉ sera offerte. Créez un compte pour la recevoir dès l’activation du programme.</p><button type="button" onClick={() => setShowAuthModal(true)} className="mt-3 w-full rounded-xl border-2 border-primary bg-primary/5 py-3 font-semibold text-primary">M’inscrire ou me connecter</button></div>
            <CustomerInfoForm optionalContact onSubmit={(info) => { setCustomerInfo(info); setStep("payment"); }} initialValues={customerInfo || undefined} />
          </div> : <ProfileCompletion
            key={authUser?.id ?? "checkout-profile"}
            onComplete={handleProfileComplete}
            isDelivery={orderType === "delivery"}
            sessionHint={authSession}
          />
        )}

        {step === "payment" && (
          <div className="space-y-4 pb-6">
            <div className={`rounded-xl border bg-card p-4 shadow-card space-y-3 relative transition-all duration-500 ${isCartHydrating ? 'blur-sm opacity-60' : ''}`}>
              {isCartHydrating && (
                <div className="absolute inset-0 flex items-center justify-center z-10">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                </div>
              )}
              <h3 className="text-sm font-bold text-foreground">Récapitulatif</h3>
              {items.map((item) => (
                <div key={item.id} className="flex items-start justify-between text-sm gap-2">
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-foreground">{item.quantity}× {item.product_name}</span>
                    {item.options.length > 0 && (
                      <p className="text-xs text-muted-foreground">{item.options.map((o) => o.name).join(", ")}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-semibold text-foreground">{(item.unit_price * item.quantity).toFixed(2)} €</span>
                    <button
                      onClick={() => { setEditingItem(item); }}
                      className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold text-primary hover:bg-primary/10 transition-colors"
                    >
                      <Pencil className="h-3 w-3" />
                      Modifier
                    </button>
                  </div>
                </div>
              ))}
              <div className="border-t pt-2 space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Sous-total</span>
                  <span className="font-medium text-foreground">{total.toFixed(2)} €</span>
                </div>
                {orderType === "delivery" && estimatedDeliveryFee > 0 && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Frais de livraison</span>
                    <span className="font-medium text-foreground">{estimatedDeliveryFee.toFixed(2)} €</span>
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-base font-bold text-foreground">Total</span>
                <span className="text-base font-extrabold text-primary">{finalTotal.toFixed(2)} €</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${otConfig.color}`}>
                  <OtIcon className="h-3 w-3" />
                  {otConfig.label}
                </span>
              </div>
              {customerInfo && (customerInfo.name || customerInfo.phone || customerInfo.email || customerInfo.address) && (
                <div className="border-t pt-2 text-xs text-muted-foreground space-y-0.5">
                  <p>{customerInfo.name}</p>
                  <p>{customerInfo.phone}</p>
                  <p>{customerInfo.email}</p>
                  {customerInfo.address && <p className="font-semibold text-foreground">📍 {customerInfo.address}</p>}
                </div>
              )}
              {orderNote && (
                <div className="border-t pt-2">
                  <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                    <MessageSquare className="h-3 w-3 mt-0.5 shrink-0 text-primary" />
                    <span className="italic">{orderNote}</span>
                  </p>
                </div>
              )}
            </div>

            {orderType === "delivery" && (
              <DeliveryInstructions
                selected={deliveryInstruction}
                onSelect={setDeliveryInstruction}
                comment={deliveryComment}
                onCommentChange={setDeliveryComment}
              />
            )}

            {/* Schedule picker moved to restaurant page OrderTypeSelector */}

            {!menuGuest && <PaymentMethodSelector orderType={orderType} selected={paymentMethod} onSelect={setPaymentMethod} acceptedPayments={restoConfig?.accepted_payments} />}

            {!menuGuest && paymentMethod === "cash" && (
              <CashDenominationSelector orderTotal={finalTotal} onDetailsChange={setCashDetails} />
            )}

            {error && <p className="text-center text-sm text-destructive">{error}</p>}

            <button onClick={handleOrder} disabled={submitting || !restoConfig || (!menuGuest && (!paymentMethod || !restoConfig.accepted_payments.includes(paymentMethod))) || (menuGuest && !restoConfig.accepted_payments.some((method) => method === "cash" || method === "card_counter")) || finalTotal <= 0 || ((deliveryPausedMsg || restoConfig.delivery_mode === "disabled") && orderType === "delivery") || (!menuGuest && paymentMethod === "cash" && (!cashDetails || cashDetails.total < finalTotal))}
              className="w-full rounded-xl bg-primary py-4 text-center text-base font-bold text-primary-foreground shadow-float transition-transform active:scale-[0.98] disabled:opacity-60">
              {submitting ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : `Commander — ${finalTotal.toFixed(2)} €`}
            </button>
          </div>
        )}
      </div>

      {editingItem && restaurantId && (
        <ProductModal
          product={{
            id: editingItem.product_id,
            name: editingItem.product_name,
            description: null,
            price: editingItem.unit_price - editingItem.options.reduce((s, o) => s + o.price, 0),
          }}
          restaurantId={restaurantId}
          open={!!editingItem}
          onClose={() => setEditingItem(null)}
          editCartItemId={editingItem.id}
          editInitialOptions={editingItem.options}
          editInitialQuantity={editingItem.quantity}
        />
      )}

      <AuthModal
        open={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onAuthenticated={handleInlineAuthenticated}
        onEmailLogin={handleEmailLoginRedirect}
        optionalForParmigiana={menuGuest}
      />
    </ClientLayout>
  );
};

export default Cart;
