import { createClient } from "https://esm.sh/@supabase/supabase-js@2.96.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
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

/**
 * Weekly ETA learning cron — compares announced vs real durations.
 * SECURED: Requires Authorization header with valid service role key or admin JWT.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ── Authentication: verify the caller is authorized ──────────
    const authHeader = req.headers.get("Authorization");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    // Only allow service role key (used by pg_cron) — anon key is NOT accepted
    const token = authHeader?.replace("Bearer ", "") || "";

    if (token !== serviceKey) {
      // Try to validate as a user JWT — must be super_admin
      const supabaseAuth = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader || "" } } }
      );
      const { data: claimsData, error: claimsErr } = await supabaseAuth.auth.getClaims(token);
      if (claimsErr || !claimsData?.claims?.sub) {
        return json({ error: "Unauthorized" }, 401);
      }
      // Verify super_admin role
      const adminClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );
      const { data: roleCheck } = await adminClient
        .from("user_roles")
        .select("role")
        .eq("user_id", claimsData.claims.sub)
        .eq("role", "super_admin")
        .eq("is_active", true)
        .maybeSingle();
      if (!roleCheck) {
        return json({ error: "Forbidden" }, 403);
      }
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Calculate week boundaries
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - 7);
    weekStart.setHours(0, 0, 0, 0);

    const weekEnd = new Date(now);
    weekEnd.setHours(0, 0, 0, 0);

    // Get all restaurants
    const { data: restaurants } = await supabase
      .from("restaurants")
      .select("id, avg_prep_time");

    if (!restaurants || restaurants.length === 0) {
      return json({ message: "No restaurants" });
    }

    const results = [];

    for (const resto of restaurants) {
      const { data: orders } = await supabase
        .from("orders")
        .select("created_at, updated_at, status")
        .eq("restaurant_id", resto.id)
        .in("status", ["ready", "delivered"])
        .gte("created_at", weekStart.toISOString())
        .lt("created_at", weekEnd.toISOString());

      if (!orders || orders.length === 0) continue;

      const durations = orders.map((o) => {
        const created = new Date(o.created_at).getTime();
        const completed = new Date(o.updated_at).getTime();
        return (completed - created) / 60000;
      });

      const avgReal = durations.reduce((a, b) => a + b, 0) / durations.length;
      const avgAnnounced = resto.avg_prep_time ?? 20;
      const correction = Math.max(0, Math.round(avgReal - avgAnnounced));

      const weekStartStr = weekStart.toISOString().split("T")[0];
      const { error } = await supabase
        .from("eta_learning")
        .upsert(
          {
            restaurant_id: resto.id,
            week_start: weekStartStr,
            total_orders: orders.length,
            avg_announced_eta: avgAnnounced,
            avg_real_duration: Math.round(avgReal),
            correction_margin: correction,
          },
          { onConflict: "restaurant_id,week_start" }
        );

      if (error) {
        console.error(`ETA learning error for ${resto.id}:`, error);
      }

      results.push({
        restaurant_id: resto.id,
        orders_count: orders.length,
        avg_real: Math.round(avgReal),
        correction,
      });
    }

    return json({ results });
  } catch (err) {
    console.error("eta-learning-cron error:", err);
    return json({ error: "Internal error" }, 500);
  }
});
