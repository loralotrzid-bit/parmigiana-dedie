import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!serviceKey || req.headers.get("Authorization") !== `Bearer ${serviceKey}`) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Delete cart_items for old active carts first (FK constraint)
    const { data: oldCarts } = await supabase
      .from("carts")
      .select("id")
      .eq("status", "active")
      .lt("updated_at", cutoff);

    const cartIds = (oldCarts || []).map((c: { id: string }) => c.id);

    if (cartIds.length > 0) {
      await supabase.from("cart_items").delete().in("cart_id", cartIds);
      await supabase.from("carts").delete().in("id", cartIds);
    }

    // Also clean up merged carts older than 7 days
    const { data: mergedCarts } = await supabase
      .from("carts")
      .select("id")
      .eq("status", "merged")
      .lt("updated_at", cutoff);

    const mergedIds = (mergedCarts || []).map((c: { id: string }) => c.id);

    if (mergedIds.length > 0) {
      await supabase.from("cart_items").delete().in("cart_id", mergedIds);
      await supabase.from("carts").delete().in("id", mergedIds);
    }

    const total = cartIds.length + mergedIds.length;
    console.log(`[cart-cleanup] Deleted ${total} abandoned carts (${cartIds.length} active, ${mergedIds.length} merged)`);

    return new Response(
      JSON.stringify({ deleted: total, active: cartIds.length, merged: mergedIds.length }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[cart-cleanup] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
