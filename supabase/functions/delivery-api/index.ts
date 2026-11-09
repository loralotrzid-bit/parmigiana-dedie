import { createClient } from "https://esm.sh/@supabase/supabase-js@2.96.0";
import { consumeRequestRateLimitPair, getTrustedClientIp } from "../_shared/requestRateLimit.ts";

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

// ── Input validation helpers ─────────────────────────────────────
const VALID_ACTIONS = ["list_available", "claim", "my_assignments", "update_status", "update_location", "history", "release_all", "serve_order", "list_table_orders"];
const VALID_ASSIGNMENT_STATUSES = ["picked_up", "in_transit", "delivered"];
const MAX_PAYLOAD_SIZE = 10_000; // 10KB
const MAX_ORDER_IDS = 20;
const MAX_ACTIVE_ASSIGNMENTS = 5; // Max simultaneous deliveries per driver

// ── Status transition rules (prevent skipping steps) ────────────
const VALID_STATUS_TRANSITIONS: Record<string, string[]> = {
  assigned: ["picked_up"],
  picked_up: ["in_transit"],
  in_transit: ["delivered"],
};

function isValidUUID(s: unknown): s is string {
  return typeof s === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
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

    const { action } = body;

    // ── Validate action ─────────────────────────────────────────
    if (typeof action !== "string" || !VALID_ACTIONS.includes(action)) {
      return json({ error: "Action inconnue" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const bearer = (req.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i)?.[1];
    if (!bearer) return json({ error: "Connexion requise" }, 401);
    const { data: authData, error: authError } = await supabase.auth.getUser(bearer);
    if (authError || !authData.user || authData.user.is_anonymous) return json({ error: "Connexion requise" }, 401);
    const { data: driver, error: driverError } = await supabase.from("delivery_drivers")
      .select("id,restaurant_id,is_active,can_deliver,can_serve,auth_user_id")
      .eq("auth_user_id", authData.user.id).maybeSingle();
    if (driverError) throw driverError;
    const servingAction = action === "serve_order" || action === "list_table_orders";
    if (!driver || !driver.is_active || (servingAction ? !driver.can_serve : !driver.can_deliver)) return json({ error: "Accès personnel désactivé" }, 403);
    const driver_id = driver.id;
    const restaurant_id = driver.restaurant_id;
    const clientIp = getTrustedClientIp(req);
    if (!clientIp) return json({ error: "Service temporairement indisponible" }, 503);
    try {
      const allowed = await consumeRequestRateLimitPair(
        supabase, serviceKey, "delivery-auth", `driver:${driver_id}`, 120, `ip:${clientIp}`, 1200, 60,
      );
      if (!allowed) return json({ error: "Trop de requêtes, réessayez dans un instant" }, 429);
    } catch {
      return json({ error: "Service temporairement indisponible" }, 503);
    }

    if (action === "list_table_orders") {
      const { data: orders, error: ordersError } = await supabase.from("orders")
        .select("id,order_number,status,total,created_at,table_number,note")
        .eq("restaurant_id", restaurant_id).eq("order_type", "dine_in")
        .in("status", ["pending", "preparing", "ready"]).order("created_at", { ascending: true }).limit(100);
      if (ordersError) throw ordersError;
      return json({ orders: orders || [] });
    }
    if (action === "serve_order") {
      const orderId = body.order_id;
      if (!isValidUUID(orderId)) return json({ error: "Commande invalide" }, 400);
      const { data: served, error: serveError } = await supabase.from("orders")
        .update({ status: "delivered", served_by: authData.user.id, served_at: new Date().toISOString() })
        .eq("id", orderId).eq("restaurant_id", restaurant_id).eq("order_type", "dine_in").eq("status", "ready")
        .select("id,status,served_at").maybeSingle();
      if (serveError) throw serveError;
      if (!served) return json({ error: "Cette commande n’est pas prête ou a déjà été clôturée." }, 409);
      return json({ order: served });
    }

    // ACTION: List available orders
    if (action === "list_available") {
      const { data: orders, error } = await supabase
        .from("orders")
        .select("*")
        .eq("restaurant_id", restaurant_id)
        .eq("status", "waiting_delivery")
        .eq("order_type", "delivery")
        .order("created_at", { ascending: true });

      if (error) throw error;

      // Strip sensitive fields from orders sent to driver
      const safeOrders = (orders || []).map((o) => {
        const { delivery_code, guest_session_id, ...rest } = o;
        return rest;
      });

      return json({ orders: safeOrders });
    }

    // ACTION: Claim orders
    if (action === "claim") {
      const { order_ids } = body;
      if (!order_ids || !Array.isArray(order_ids) || order_ids.length === 0) {
        return json({ error: "Aucune commande sélectionnée" }, 400);
      }
      if (order_ids.length > MAX_ORDER_IDS) {
        return json({ error: `Maximum ${MAX_ORDER_IDS} commandes à la fois` }, 400);
      }
      // Validate all IDs are UUIDs
      if (!order_ids.every(isValidUUID)) {
        return json({ error: "Identifiants de commande invalides" }, 400);
      }

      // Check driver doesn't exceed max active assignments
      const { count: activeCount } = await supabase
        .from("delivery_assignments")
        .select("id", { count: "exact", head: true })
        .eq("driver_id", driver_id)
        .in("status", ["assigned", "picked_up", "in_transit"]);

      if ((activeCount ?? 0) + order_ids.length > MAX_ACTIVE_ASSIGNMENTS) {
        return json({ error: `Maximum ${MAX_ACTIVE_ASSIGNMENTS} livraisons actives simultanées` }, 400);
      }

      const assignments = [];
      for (let i = 0; i < order_ids.length; i++) {
        const orderId = order_ids[i];

        // Verify order belongs to the restaurant AND is waiting
        const { data: order } = await supabase
          .from("orders")
          .select("id, status, restaurant_id")
          .eq("id", orderId)
          .eq("status", "waiting_delivery")
          .eq("restaurant_id", restaurant_id)
          .single();

        if (!order) continue;

        // Check no existing assignment
        const { data: existing } = await supabase
          .from("delivery_assignments")
          .select("id")
          .eq("order_id", orderId)
          .in("status", ["assigned", "picked_up", "in_transit"])
          .maybeSingle();

        if (existing) continue; // Already claimed

        const { data: assignment, error: aErr } = await supabase
          .from("delivery_assignments")
          .insert({
            order_id: orderId,
            driver_id,
            status: "assigned",
            delivery_order: i + 1,
          })
          .select()
          .single();

        if (aErr) { console.error("Assignment error:", aErr); continue; }

        await supabase
          .from("orders")
          .update({ status: "in_delivery" })
          .eq("id", orderId);

        assignments.push(assignment);
      }

      return json({ assignments, claimed: assignments.length }, 201);
    }

    // ACTION: Get driver's active assignments
    if (action === "my_assignments") {
      const { data, error } = await supabase
        .from("delivery_assignments")
        .select("*, orders(*)")
        .eq("driver_id", driver_id)
        .in("status", ["assigned", "picked_up", "in_transit"])
        .order("delivery_order", { ascending: true });

      if (error) throw error;

      // Strip delivery_code and guest_session_id from orders
      const safe = (data || []).map((a) => {
        if (a.orders) {
          const { delivery_code, guest_session_id, ...rest } = a.orders;
          return { ...a, orders: rest };
        }
        return a;
      });
      return json({ assignments: safe });
    }

    // ACTION: Update assignment status
    if (action === "update_status") {
      const { assignment_id, status, delivery_code } = body;

      if (!isValidUUID(assignment_id)) {
        return json({ error: "assignment_id invalide" }, 400);
      }

      if (typeof status !== "string" || !VALID_ASSIGNMENT_STATUSES.includes(status)) {
        return json({ error: "Statut invalide" }, 400);
      }

      // Verify assignment belongs to this driver AND get current status
      const { data: assignmentCheck } = await supabase
        .from("delivery_assignments")
        .select("id, order_id, driver_id, status")
        .eq("id", assignment_id)
        .eq("driver_id", driver_id)
        .single();

      if (!assignmentCheck) {
        return json({ error: "Assignation introuvable" }, 404);
      }

      // ── Enforce valid status transitions ──────────────────────
      const allowedNextStatuses = VALID_STATUS_TRANSITIONS[assignmentCheck.status];
      if (!allowedNextStatuses || !allowedNextStatuses.includes(status)) {
        return json({ error: `Transition de statut invalide: ${assignmentCheck.status} → ${status}` }, 400);
      }

      if (status === "delivered") {
        // Persistent limit also counts attempts in cold/new Edge instances. The driver
        // receives at most five verification attempts per five-minute interval.
        try {
          const allowed = await consumeRequestRateLimitPair(
            supabase, serviceKey, "delivery-code", `delivery:${assignmentCheck.order_id}`, 5, `delivery-ip:${clientIp}`, 300, 300,
          );
          if (!allowed) return json({ error: "Trop de tentatives. Réessayez dans quelques minutes." }, 429);
        } catch {
          return json({ error: "Vérification temporairement indisponible." }, 503);
        }

        const { data: order } = await supabase
          .from("orders")
          .select("delivery_code, restaurant_id")
          .eq("id", assignmentCheck.order_id)
          .single();

        // Verify order belongs to the driver's restaurant
        if (!order || order.restaurant_id !== restaurant_id) {
          return json({ error: "Commande introuvable" }, 404);
        }

        if (!order.delivery_code || typeof delivery_code !== "string" || delivery_code.trim() !== order.delivery_code.trim()) {
          return json({ error: "Code de livraison incorrect" }, 400);
        }

        await supabase
          .from("delivery_assignments")
          .update({ status: "delivered", delivered_at: new Date().toISOString() })
          .eq("id", assignment_id);

        await supabase
          .from("orders")
          .update({ status: "delivered" })
          .eq("id", assignmentCheck.order_id);

        return json({ success: true });
      }

      // Non-delivered status updates
      const extras: Record<string, string> = {};
      if (status === "picked_up") extras.picked_up_at = new Date().toISOString();

      const { data: updatedAssignment, error } = await supabase
        .from("delivery_assignments")
        .update({ status, ...extras })
        .eq("id", assignment_id)
        .eq("driver_id", driver_id) // Ensure ownership
        .select("*, orders(*)")
        .single();

      if (error) throw error;

      if (status === "in_transit" && updatedAssignment?.order_id) {
        await supabase
          .from("orders")
          .update({ status: "in_delivery" })
          .eq("id", updatedAssignment.order_id);
      }

      // Strip sensitive data
      if (updatedAssignment?.orders) {
        const { delivery_code: _dc, guest_session_id: _gs, ...safeOrder } = updatedAssignment.orders;
        updatedAssignment.orders = safeOrder;
      }

      return json({ assignment: updatedAssignment });
    }

    // ACTION: Update driver GPS location
    if (action === "update_location") {
      const { latitude, longitude, heading, speed, accuracy } = body;

      if (typeof latitude !== "number" || typeof longitude !== "number" ||
          !isFinite(latitude) || !isFinite(longitude) ||
          Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
        return json({ error: "Coordonnées invalides" }, 400);
      }

      // Reject low-accuracy positions (WiFi/cell tower)
      if (typeof accuracy === "number" && accuracy > 80) {
        return json({ error: "Position trop imprécise" }, 400);
      }

      const safeHeading = typeof heading === "number" && isFinite(heading) && heading >= 0 && heading <= 360 ? heading : null;
      // Cap speed at 200 km/h (~55 m/s) to detect GPS spoofing
      const MAX_SPEED_MS = 56; // ~200 km/h
      const safeSpeed = typeof speed === "number" && isFinite(speed) && speed >= 0 && speed <= MAX_SPEED_MS ? speed : null;

      // Server-side jump detection: check previous position
      const { data: prevLoc } = await supabase
        .from("driver_locations")
        .select("latitude, longitude, updated_at")
        .eq("driver_id", driver_id)
        .single();

      if (prevLoc) {
        const R = 6371000;
        const toRad = (d: number) => (d * Math.PI) / 180;
        const dLat = toRad(latitude - Number(prevLoc.latitude));
        const dLng = toRad(longitude - Number(prevLoc.longitude));
        const a = Math.sin(dLat / 2) ** 2 +
          Math.cos(toRad(Number(prevLoc.latitude))) * Math.cos(toRad(latitude)) * Math.sin(dLng / 2) ** 2;
        const distMeters = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const elapsedSec = (Date.now() - new Date(prevLoc.updated_at).getTime()) / 1000;

        // Reject teleports: >2km in <60s
        if (distMeters > 2000 && elapsedSec < 60) {
          console.warn(`GPS spoofing rejected for driver ${driver_id}: ${distMeters.toFixed(0)}m in ${elapsedSec.toFixed(0)}s`);
          return json({ error: "Déplacement anormal détecté" }, 400);
        }
      }

      const { error } = await supabase
        .from("driver_locations")
        .upsert(
          {
            driver_id,
            latitude,
            longitude,
            heading: safeHeading,
            speed: safeSpeed,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "driver_id" }
        );

      if (error) throw error;
      return json({ success: true });
    }

    // ACTION: Get driver's delivery history
    if (action === "history") {
      const { data, error } = await supabase
        .from("delivery_assignments")
        .select("*, orders(*)")
        .eq("driver_id", driver_id)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;

      // Strip sensitive data from history
      const safe = (data || []).map((a) => {
        if (a.orders) {
          const { delivery_code, guest_session_id, ...rest } = a.orders;
          return { ...a, orders: rest };
        }
        return a;
      });

      return json({ assignments: safe });
    }

    // ACTION: Release all active assignments for this driver
    if (action === "release_all") {
      const { data: active, error: fetchErr } = await supabase
        .from("delivery_assignments")
        .select("id, order_id")
        .eq("driver_id", driver_id)
        .in("status", ["assigned", "picked_up", "in_transit"]);

      if (fetchErr) throw fetchErr;

      if (active && active.length > 0) {
        const assignmentIds = active.map((a) => a.id);
        const orderIds = active.map((a) => a.order_id);

        await supabase
          .from("delivery_assignments")
          .delete()
          .in("id", assignmentIds);

        await supabase
          .from("orders")
          .update({ status: "waiting_delivery" })
          .in("id", orderIds);
      }

      return json({ success: true, released: active?.length ?? 0 });
    }

    return json({ error: "Action inconnue" }, 400);
  } catch (err) {
    console.error("delivery-api error:", err);
    // Never expose internal errors
    return json({ error: "Une erreur interne est survenue" }, 500);
  }
});
