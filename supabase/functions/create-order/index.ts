import { priceOptions } from "../_shared/orderPricing.ts";
import { menuBasePrice, isWeekend } from "../_shared/menuPricing.ts";
import { resolveMenuSession } from "../_shared/menuSession.ts";
import { consumeRequestRateLimit } from "../_shared/requestRateLimit.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.96.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, ...securityHeaders, "Content-Type": "application/json" },
  });
}

function generateDeliveryCode(): string {
  // Use rejection sampling to eliminate modulo bias (256 % 10 != 0)
  const digits: string[] = [];
  while (digits.length < 5) {
    const array = new Uint8Array(1);
    crypto.getRandomValues(array);
    // Only accept values 0-249 to ensure uniform distribution of 0-9
    if (array[0] < 250) {
      digits.push((array[0] % 10).toString());
    }
  }
  return digits.join("");
}

// ── Input validation ──────────────────────────────────────────────
const VALID_ORDER_TYPES = ["takeaway", "dine_in", "delivery"] as const;
const VALID_ORDER_SOURCES = ["direct", "qr", "pos", "phone", "server"] as const;
const VALID_PAYMENT_METHODS = ["cash", "card_delivery", "card_counter", "wero"] as const;
const MAX_ITEMS = 50;
const MAX_OPTIONS_PER_ITEM = 40;
const MAX_NOTE_LENGTH = 500;
const MAX_ADDRESS_LENGTH = 300;
const MAX_PHONE_LENGTH = 20;
const MAX_PAYLOAD_SIZE = 50_000; // 50KB

function isValidUUID(s: unknown): s is string {
  return typeof s === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

function sanitizeString(s: unknown, maxLen: number): string | null {
  if (s == null || typeof s !== "string") return null;
  // Strip HTML tags, script content, and trim
  return s
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]*>/g, "")
    .replace(/javascript:/gi, "")
    .replace(/on\w+\s*=/gi, "")
    .trim()
    .slice(0, maxLen) || null;
}

const BUSINESS_TIME_ZONE = "Europe/Brussels";

function getDateKeyInTimeZone(date: Date, timeZone = BUSINESS_TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "00";
  const day = parts.find((part) => part.type === "day")?.value ?? "00";

  return `${year}-${month}-${day}`;
}

// ── Rate limiter (per guest_session_id) ─────────────────────────
const orderRateMap = new Map<string, { count: number; resetAt: number }>();
const ORDER_RATE_WINDOW = 60_000; // 1 minute
const ORDER_RATE_MAX = 3; // 3 orders/minute per session (anti-spam)

function isOrderRateLimited(sessionId: string): boolean {
  const now = Date.now();
  const entry = orderRateMap.get(sessionId);
  if (!entry || now > entry.resetAt) {
    orderRateMap.set(sessionId, { count: 1, resetAt: now + ORDER_RATE_WINDOW });
    return false;
  }
  entry.count++;
  return entry.count > ORDER_RATE_MAX;
}

// Periodic cleanup of rate limit map (prevent memory leak)
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of orderRateMap) {
    if (now > val.resetAt) orderRateMap.delete(key);
  }
}, 120_000);

// ── Cash details sanitizer ──────────────────────────────────────
function sanitizeCashDetails(raw: unknown): { counts: Record<string, number>; total: number } | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.total !== "number" || !isFinite(obj.total) || obj.total < 0) return null;
  if (!obj.counts || typeof obj.counts !== "object") return null;
  const counts: Record<string, number> = {};
  for (const [key, val] of Object.entries(obj.counts as Record<string, unknown>)) {
    if (typeof val === "number" && Number.isInteger(val) && val >= 0 && val <= 100) {
      counts[key] = val;
    }
  }
  return { counts, total: Math.round(obj.total * 100) / 100 };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    // ── Payload size check ──────────────────────────────────────
    const contentLength = req.headers.get("content-length");
    if (contentLength && parseInt(contentLength) > MAX_PAYLOAD_SIZE) {
      return json({ error: "Payload trop volumineux" }, 413);
    }

    const rawBody = await req.text();
    if (rawBody.length > MAX_PAYLOAD_SIZE) {
      return json({ error: "Payload trop volumineux" }, 413);
    }

    let body: Record<string, unknown>;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return json({ error: "JSON invalide" }, 400);
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return json({ error: "Requête invalide" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const {
      restaurant_id,
      guest_session_id,
      order_type,
      items,
      note,
      order_source,
      delivery_address,
      delivery_postcode,
      delivery_lat,
      delivery_lng,
      client_phone,
      table_number,
      payment_method,
      cash_details,
      scheduled_at,
    } = body as Record<string, unknown>;
    let rateLimitIdentity: string | null = null;
    let authenticatedUserId: string | null = null;

    // ── Required fields ─────────────────────────────────────────
    if (!restaurant_id || !guest_session_id || !items || !Array.isArray(items) || items.length === 0) {
      return json({ error: "Missing required fields" }, 400);
    }

    if (!isValidUUID(restaurant_id)) {
      return json({ error: "Requête invalide" }, 400);
    }

    if (typeof guest_session_id !== "string" || guest_session_id.length > 100) {
      return json({ error: "Requête invalide" }, 400);
    }

    // The service-role client bypasses RLS: validate identity before any writes.
    const menuSession = await resolveMenuSession(supabase, body.menu_session_token);
    if (body.menu_session_token && !menuSession) return json({ error: "Session menu expirée. Scannez à nouveau le QR code." }, 403);
    if (menuSession) {
      if (menuSession.restaurant_id !== restaurant_id || menuSession.cart_session_id !== guest_session_id || order_source !== "qr" || (order_type !== "dine_in" && order_type !== "takeaway")) return json({ error: "Parcours menu invalide" }, 403);
      if (menuSession.order_id) {
        const { data: previous } = await supabase.from("orders").select("*").eq("id", menuSession.order_id).single();
        if (previous) { const { delivery_code, ...safe } = previous; return json({ order: safe }, 200); }
      }
      if (client_phone != null && client_phone !== "" && (typeof client_phone !== "string" || !/^[+\d\s().-]{8,25}$/.test(client_phone.trim()))) return json({ error: "Numéro de téléphone invalide" }, 400);
      rateLimitIdentity = `menu:${menuSession.cart_session_id}`;
    } else {
    const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Connexion requise" }, 401);
    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authData.user || authData.user.is_anonymous) {
      return json({ error: "Connexion requise" }, 401);
    }
    if (guest_session_id !== authData.user.id) {
      return json({ error: "Identité de commande invalide" }, 403);
    }
    authenticatedUserId = authData.user.id;
    rateLimitIdentity = `user:${authData.user.id}`;
    if (order_source === "server") {
      const { data: staff, error: staffError } = await supabase.from("delivery_drivers")
        .select("id,is_active,can_serve,restaurant_id").eq("auth_user_id", authData.user.id).maybeSingle();
      if (staffError) throw staffError;
      if (!staff?.is_active || !staff.can_serve || staff.restaurant_id !== restaurant_id) return json({ error: "Accès caisse serveur refusé" }, 403);
    }
    if (order_source === "pos" || order_source === "phone") {
      const { data: roles, error: rolesError } = await supabase.from("user_roles")
        .select("role").eq("user_id", authData.user.id).eq("is_active", true);
      if (rolesError) throw rolesError;
      const isSuperAdmin = roles?.some((r: { role: string }) => r.role === "super_admin");
      const isRestaurantAdmin = roles?.some((r: { role: string }) => r.role === "restaurant_admin");
      if (!isSuperAdmin) {
        if (!isRestaurantAdmin) return json({ error: "Accès caisse refusé" }, 403);
        const { data: profile, error: profileError } = await supabase.from("profiles")
          .select("restaurant_id").eq("user_id", authData.user.id).maybeSingle();
        if (profileError) throw profileError;
        if (profile?.restaurant_id !== restaurant_id) return json({ error: "Accès caisse refusé" }, 403);
      }
    }

    }
    if (order_source === "phone" && (typeof client_phone !== "string" || (!/^[+\d\s().-]{8,25}$/.test(client_phone.trim()) || client_phone.replace(/\D/g, "").length < 8) || order_type === "dine_in")) return json({ error: "Une commande téléphonique exige un numéro valide et un retrait ou une livraison autorisée" }, 400);
    const safeDeliveryPostcode = typeof delivery_postcode === "string" && /^\d{4}$/.test(delivery_postcode) ? delivery_postcode : null;
    if (order_source === "phone" && order_type === "delivery" && !safeDeliveryPostcode) return json({ error: "Un code postal belge à 4 chiffres est requis pour une livraison téléphonique" }, 400);
    if (order_source === "phone" && !isValidUUID(body.request_id)) return json({ error: "Identifiant de requête requis" }, 400);
    if (order_source === "server" && (!isValidUUID(body.request_id) || order_type !== "dine_in" || typeof table_number !== "number" || !Number.isInteger(table_number) || table_number < 1 || table_number > 10)) return json({ error: "Commande serveur invalide (table 1 à 10 requise)" }, 400);
    if (body.table_call_id != null && (order_source !== "server" || !isValidUUID(body.table_call_id))) return json({ error: "Appel de table invalide" }, 400);
    // ── Rate limiting ───────────────────────────────────────────
    if (isOrderRateLimited(guest_session_id)) {
      return json({ error: "Trop de commandes, veuillez patienter" }, 429);
    }
    try {
      const allowed = await consumeRequestRateLimit(
        supabase,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        "create-order",
        rateLimitIdentity || `session:${guest_session_id}`,
        ORDER_RATE_MAX,
        ORDER_RATE_WINDOW / 1000,
      );
      if (!allowed) return json({ error: "Trop de commandes, veuillez patienter" }, 429);
    } catch (error) {
      console.error("[create-order] shared rate limiter unavailable:", error instanceof Error ? error.message : "unknown");
      return json({ error: "Service temporairement indisponible. Réessayez dans un instant." }, 503);
    }

    if (items.length > MAX_ITEMS) {
      return json({ error: `Maximum ${MAX_ITEMS} articles par commande` }, 400);
    }

    if (typeof order_type !== "string" || !VALID_ORDER_TYPES.includes(order_type as typeof VALID_ORDER_TYPES[number]) || typeof payment_method !== "string" || !VALID_PAYMENT_METHODS.includes(payment_method as typeof VALID_PAYMENT_METHODS[number])) {
      return json({ error: "Mode de commande ou de paiement invalide" }, 400);
    }

    // ── Validate enums ──────────────────────────────────────────
    const safeOrderType = order_type as typeof VALID_ORDER_TYPES[number];
    const safeOrderSource = VALID_ORDER_SOURCES.find((source) => source === order_source) ?? "direct";
    const safePaymentMethod = payment_method as typeof VALID_PAYMENT_METHODS[number];

    // ── Sanitize strings ────────────────────────────────────────
    const safeNote = sanitizeString(note, MAX_NOTE_LENGTH);
    const safeAddress = sanitizeString(delivery_address, MAX_ADDRESS_LENGTH);
    const safePhone = sanitizeString(client_phone, MAX_PHONE_LENGTH);

    // ── Validate numeric fields ─────────────────────────────────
    const safeDeliveryLat = typeof delivery_lat === "number" && isFinite(delivery_lat) && Math.abs(delivery_lat) <= 90 ? delivery_lat : null;
    const safeDeliveryLng = typeof delivery_lng === "number" && isFinite(delivery_lng) && Math.abs(delivery_lng) <= 180 ? delivery_lng : null;
    const requestedTable = menuSession?.table_number ?? table_number;
    const safeTableNumber = safeOrderType !== "dine_in" ? null : typeof requestedTable === "number" && Number.isInteger(requestedTable) && requestedTable > 0 && requestedTable < 1000 ? requestedTable : null;

    // Validate scheduled_at — must be a valid ISO date in the future
    let safeScheduledAt: string | null = null;
    if (scheduled_at && typeof scheduled_at === "string") {
      const parsed = new Date(scheduled_at);
      if (!isNaN(parsed.getTime()) && parsed.getTime() > Date.now()) {
        safeScheduledAt = parsed.toISOString();
      }
    }

    if (scheduled_at != null && !safeScheduledAt) {
      return json({ error: "Date de commande invalide" }, 400);
    }

    // ── Validate items structure ────────────────────────────────
    const quantitiesByProduct = new Map<string, number>();
    for (const item of items) {
      if (!item || typeof item !== "object" || !item.product_id || !isValidUUID(item.product_id)) {
        return json({ error: "product_id invalide dans les articles" }, 400);
      }
      if (typeof item.quantity !== "number" || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 99) {
        return json({ error: "Quantité invalide" }, 400);
      }
      if (item.options != null && (!Array.isArray(item.options) || item.options.length > MAX_OPTIONS_PER_ITEM || item.options.some((o: unknown) => !o || typeof o !== "object" || typeof (o as { name?: unknown }).name !== "string"))) {
        return json({ error: "Options invalides" }, 400);
      }
      quantitiesByProduct.set(item.product_id, (quantitiesByProduct.get(item.product_id) || 0) + item.quantity);
    }

    // ── Check restaurant exists & pause ────────────────────────
    const { data: restoCheck } = await supabase
      .from("restaurants")
      .select("slug, digital_menu_enabled, takeaway_discount, dine_in_enabled, accepted_payments, is_paused, delivery_flat_fee, delivery_per_km_fee, is_free_delivery, delivery_free_under_km, max_delivery_radius_km, latitude, longitude, delivery_mode, scheduling_mode")
      .eq("id", restaurant_id)
      .single();

    if (!restoCheck) {
      // Generic error — don't reveal if restaurant exists
      return json({ error: "Requête invalide" }, 400);
    }

    if (restoCheck.is_paused) {
      return json({ error: "Ce restaurant est actuellement en pause. Réessayez plus tard." }, 400);
    }
    if (menuSession && (!restoCheck.digital_menu_enabled || restoCheck.slug !== "la-parmigiana")) return json({ error: "Parcours menu désactivé" }, 403);

    // The public/app delivery toggle does not disable staff-entered phone orders.
    // Phone delivery uses its own postcode tariff below and still requires staff authorization.
    if (safeOrderType === "delivery" && restoCheck.delivery_mode === "disabled" && safeOrderSource !== "phone") {
      return json({ error: "La livraison n'est pas disponible pour ce restaurant" }, 400);
    }
    if (safeOrderType === "dine_in" && !restoCheck.dine_in_enabled) {
      return json({ error: "Les commandes sur place ne sont pas disponibles" }, 400);
    }
    if (!restoCheck.accepted_payments?.includes(safePaymentMethod)) {
      return json({ error: "Ce moyen de paiement n'est pas accepté par ce restaurant" }, 400);
    }
    // POS payments are collected at the counter, including delivery tickets.
    if (safeOrderSource !== "pos" && ((safePaymentMethod === "card_delivery" && safeOrderType !== "delivery") ||
        (safePaymentMethod === "card_counter" && safeOrderType === "delivery"))) {
      return json({ error: "Ce moyen de paiement ne correspond pas au mode de commande" }, 400);
    }

    // ── Validate scheduling_mode vs scheduled_at ──────────────
    const sMode = restoCheck.scheduling_mode || "all";
    // future_only: scheduling is mandatory (no ASAP allowed)
    // today_only: ASAP is allowed, scheduling restricted to today (validated client-side)
    if (sMode === "future_only" && !safeScheduledAt) {
      return json({ error: "Ce restaurant n'accepte que les commandes programmées" }, 400);
    }
    if (sMode === "future_only" && safeScheduledAt) {
      const scheduledDate = new Date(safeScheduledAt);
      const scheduledDateKey = getDateKeyInTimeZone(scheduledDate);
      const todayDateKey = getDateKeyInTimeZone(new Date());
      if (scheduledDateKey === todayDateKey) {
        return json({ error: "Ce restaurant n'accepte que les commandes programmées à partir de demain" }, 400);
      }
    }

    if (sMode === "today_only" && safeScheduledAt &&
        getDateKeyInTimeZone(new Date(safeScheduledAt)) !== getDateKeyInTimeZone(new Date())) {
      return json({ error: "Ce restaurant n'accepte que les commandes pour aujourd'hui" }, 400);
    }

    // ── Delivery fee server-side calculation ────────────────────
    let deliveryFee = 0;
    if (safeOrderType === "delivery") {
      if (!restoCheck.is_free_delivery && restoCheck.delivery_mode !== "disabled") {
        deliveryFee = restoCheck.delivery_flat_fee || 0;
        // If mode is flat, just use flat fee — no distance calculation
        if (restoCheck.delivery_mode !== "flat") {
          // Calculate distance-based fee if lat/lng available
          if (safeDeliveryLat && safeDeliveryLng && restoCheck.latitude && restoCheck.longitude) {
            const R = 6371;
            const dLat = (safeDeliveryLat - restoCheck.latitude) * Math.PI / 180;
            const dLon = (safeDeliveryLng - restoCheck.longitude) * Math.PI / 180;
            const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(restoCheck.latitude * Math.PI / 180) * Math.cos(safeDeliveryLat * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
            const km = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

            // Check max delivery radius
            if (km > (restoCheck.max_delivery_radius_km || 10)) {
              return json({ error: "Adresse hors zone de livraison" }, 400);
            }

            if (restoCheck.delivery_free_under_km && km <= restoCheck.delivery_free_under_km) {
              deliveryFee = 0;
            } else {
              deliveryFee += (restoCheck.delivery_per_km_fee || 0) * km;
            }
          }
        }
      }
    }
    if (safeOrderSource === "phone" && safeOrderType === "delivery") {
      const { data: postcodeRate, error: postcodeRateError } = await supabase
        .from("restaurant_delivery_postcode_rates")
        .select("fee")
        .eq("restaurant_id", restaurant_id)
        .eq("postcode", safeDeliveryPostcode!)
        .eq("is_active", true)
        .maybeSingle();
      if (postcodeRateError) throw postcodeRateError;
      const { data: fallback, error: fallbackError } = await supabase
        .from("restaurants")
        .select("phone_delivery_fallback_fee")
        .eq("id", restaurant_id)
        .single();
      if (fallbackError) throw fallbackError;
      deliveryFee = Math.round(Number(postcodeRate?.fee ?? fallback.phone_delivery_fallback_fee ?? 15) * 100) / 100;
    }

    // ── SERVER-SIDE PRICE CALCULATION ───────────────────────────
    // CRITICAL: Never trust frontend prices. Recalculate everything from DB.
    let subtotal = 0;

    for (const item of items) {
      const { data: product } = await supabase
        .from("products")
        .select("stock, is_available, is_published, weekend_only, name, price, menu_supplement, menu_label, category_id")
        .eq("id", item.product_id)
        .single();

      if (!product) {
        return json({ error: "Produit introuvable" }, 400);
      }

      // Verify product belongs to the specified restaurant
      const { data: productCategory } = await supabase
        .from("categories")
        .select("restaurant_id")
        .eq("id", product.category_id)
        .single();

      if (!productCategory || productCategory.restaurant_id !== restaurant_id) {
        return json({ error: "Produit invalide pour ce restaurant" }, 400);
      }

      if (!product.is_available || (!product.is_published && safeOrderSource !== "pos")) {
        return json({ error: `"${product.name}" n'est plus disponible` }, 400);
      }
      if (product.weekend_only && !isWeekend(safeScheduledAt ? new Date(safeScheduledAt) : new Date())) return json({ error: "Cet article est proposé uniquement le week-end" }, 400);

      if (product.stock !== null && product.stock < quantitiesByProduct.get(item.product_id)!) {
        return json({ error: `Stock insuffisant pour "${product.name}" (reste: ${product.stock})` }, 400);
      }

      // Calculate item price from DB
      let itemPrice = menuBasePrice(Number(product.price), safeOrderType, !!restoCheck.digital_menu_enabled, Number(restoCheck.takeaway_discount || 0));

      // Read every pricing rule from the existing catalogue; fail closed on DB errors.
      const { data: optionGroups, error: groupsError } = await supabase
        .from("product_option_groups").select("*").eq("product_id", item.product_id).order("sort_order");
      if (groupsError) throw groupsError;
      const { data: allOptions, error: optionsError } = await supabase
        .from("product_options").select("*").eq("product_id", item.product_id).order("sort_order");
      if (optionsError) throw optionsError;
      const groups = [];
      for (const group of optionGroups || []) {
        let options = (allOptions || []).filter((o) => o.option_group_id === group.id);
        if (group.linked_category_id) {
          const { data: linked, error: linkedError } = await supabase.from("products")
            .select("name, price, is_available").eq("category_id", group.linked_category_id)
            .eq("is_published", true).eq("is_available", true).order("sort_order");
          if (linkedError) throw linkedError;
          options = (linked || []).map((p) => ({
            name: p.name, price_supplement: Number(p.price),
            is_available: p.is_available, option_group_id: group.id,
          }));
        }
        groups.push({ ...group, options });
      }
      try {
        const priced = priceOptions(item.options || [], groups,
          (allOptions || []).filter((o) => !o.option_group_id),
          product.menu_label || "Menu", product.menu_supplement);
        itemPrice += priced.supplement;
        item.options = priced.choices;
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : "Options invalides" }, 400);
      }

      // Store server-calculated unit price on item for insertion
      item._server_unit_price = itemPrice;
      item._server_product_name = product.name;

      subtotal += itemPrice * item.quantity;
    }

    // Round to 2 decimal places to avoid floating point issues
    subtotal = Math.round(subtotal * 100) / 100;
    deliveryFee = Math.round(deliveryFee * 100) / 100;
    const total = subtotal + deliveryFee;

    // ── Reject zero-total orders ────────────────────────────────
    if (total <= 0) {
      return json({ error: "Le total de la commande doit être supérieur à 0 €" }, 400);
    }
    if (menuSession) {
      const { data: guestOrder, error: guestError } = await supabase.rpc("submit_digital_menu_order", {
        p_session_id: menuSession.id,
        p_order: { order_type: safeOrderType, subtotal, total, note: safeNote, client_phone: safePhone, table_number: safeTableNumber, payment_method: safePaymentMethod, cash_details: sanitizeCashDetails(cash_details) },
        p_items: items,
      });
      if (guestError) throw guestError;
      return json({ order: guestOrder }, 201);
    }

    if (safeOrderSource === "server") {
      if (!authenticatedUserId || safeOrderType !== "dine_in" || !safeTableNumber || safeTableNumber > 10) return json({ error: "Commande serveur invalide" }, 400);
      const { data: staffOrder, error: staffOrderError } = await supabase.rpc("submit_staff_order", {
        p_request_id: body.request_id, p_user_id: authenticatedUserId,
        p_order: { restaurant_id, order_type: safeOrderType, subtotal, total, note: safeNote, table_number: safeTableNumber, payment_method: safePaymentMethod, table_call_id: body.table_call_id ?? null },
        p_items: items,
      });
      if (staffOrderError) throw staffOrderError;
      return json({ order: staffOrder }, 201);
    }

    // ── Calculate order number ──────────────────────────────────
    if (safeOrderSource === "phone") {
      const { data: phoneOrder, error: phoneError } = await supabase.rpc("submit_phone_order", {
        p_request_id: body.request_id, p_user_id: guest_session_id,
        p_order: { restaurant_id, order_type: safeOrderType, subtotal, total, note: safeNote, client_phone: safePhone, payment_method: safePaymentMethod, delivery_address: safeAddress, delivery_postcode: safeDeliveryPostcode, delivery_lat: safeDeliveryLat, delivery_lng: safeDeliveryLng, delivery_fee: deliveryFee, scheduled_at: safeScheduledAt },
        p_items: items,
      });
      if (phoneError) throw phoneError;
      return json({ order: phoneOrder }, 201);
    }

    const { data: numData, error: numErr } = await supabase.rpc(
      "next_order_number",
      { p_restaurant_id: restaurant_id }
    );
    if (numErr) throw numErr;

    // ── Generate delivery code ──────────────────────────────────
    const deliveryCode = safeOrderType === "delivery" ? generateDeliveryCode() : null;

    // ── Create order ────────────────────────────────────────────
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .insert({
        restaurant_id,
        guest_session_id,
        order_number: numData,
        order_type: safeOrderType,
        order_source: safeOrderSource,
        eta_confidence: "medium",
        status: safeOrderSource === "pos" ? "delivered" : "pending",
        payment_status: safeOrderSource === "pos" ? "paid" : "unpaid",
        subtotal,
        total,
        note: safeNote,
        delivery_code: deliveryCode,
        delivery_address: safeAddress,
        delivery_postcode: safeDeliveryPostcode,
        delivery_lat: safeDeliveryLat,
        delivery_lng: safeDeliveryLng,
        client_phone: safePhone,
        table_number: safeTableNumber,
        payment_method: safePaymentMethod,
        // Sanitize cash_details: only allow expected structure
        cash_details: sanitizeCashDetails(cash_details),
        scheduled_at: safeScheduledAt,
      })
      .select()
      .single();

    if (orderErr) throw orderErr;

    // ── Create order items (using server-calculated prices) ─────
    for (const item of items) {
      const serverPrice = item._server_unit_price;
      const serverName = item._server_product_name;

      const { data: orderItem, error: itemErr } = await supabase
        .from("order_items")
        .insert({
          order_id: order.id,
          product_id: item.product_id,
          product_name: serverName,
          quantity: item.quantity,
          unit_price: serverPrice,
          total_price: serverPrice * item.quantity,
        })
        .select()
        .single();

      if (itemErr) throw itemErr;

      // Create choices (using server-validated prices)
      if (item.options && item.options.length > 0) {
        const choices = item.options.map((opt: { name: string; price: number }) => ({
          order_item_id: orderItem.id,
          option_name: typeof opt.name === "string" ? opt.name.slice(0, 200) : "unknown",
          price_supplement: typeof opt.price === "number" ? opt.price : 0,
        }));

        const { error: choicesErr } = await supabase
          .from("order_item_choices")
          .insert(choices);

        if (choicesErr) throw choicesErr;
      }
    }

    // Strip delivery_code from response — client sees it via RLS on orders table
    const { delivery_code: _dc, ...safeOrder } = order;
    return json({ order: safeOrder }, 201);
  } catch (err) {
    console.error("create-order error:", err);
    // Never expose internal error details to client
    return json({ error: "Une erreur est survenue lors de la création de la commande" }, 500);
  }
});
