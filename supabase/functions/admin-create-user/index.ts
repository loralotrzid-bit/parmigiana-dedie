import { createClient } from "https://esm.sh/@supabase/supabase-js@2.96.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
});

const MAX_BODY_BYTES = 4_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    // Verify caller is super_admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: claims, error: claimsErr } = await anonClient.auth.getClaims(
      authHeader.replace("Bearer ", "")
    );
    if (claimsErr || !claims?.claims?.sub || claims.claims.is_anonymous === true) {
      return json({ error: "Unauthorized" }, 401);
    }

    const callerId = claims.claims.sub as string;

    // Check super_admin role
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: roleCheck, error: roleError } = await serviceClient
      .from("user_roles")
      .select("id")
      .eq("user_id", callerId)
      .eq("role", "super_admin")
      .eq("is_active", true)
      .maybeSingle();

    if (roleError) return json({ error: "Authorization check unavailable" }, 503);
    if (!roleCheck) return json({ error: "Forbidden" }, 403);

    const rawBody = await req.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
      return json({ error: "Request too large" }, 413);
    }
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }

    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const restaurantId = typeof body.restaurant_id === "string" ? body.restaurant_id : "";
    const displayName = typeof body.display_name === "string" ? body.display_name.trim() : "";

    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ error: "Invalid email" }, 400);
    }
    if (password.length < 12 || password.length > 128) {
      return json({ error: "Password must be between 12 and 128 characters" }, 400);
    }
    if (!UUID_RE.test(restaurantId)) return json({ error: "Invalid restaurant" }, 400);
    if (displayName.length > 100) return json({ error: "Display name is too long" }, 400);

    const { data: restaurant, error: restaurantError } = await serviceClient
      .from("restaurants").select("id").eq("id", restaurantId).maybeSingle();
    if (restaurantError) return json({ error: "Restaurant validation unavailable" }, 503);
    if (!restaurant) return json({ error: "Restaurant not found" }, 404);

    // Create user with auto-confirm (no email verification)
    const { data: newUser, error: createErr } =
      await serviceClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

    if (createErr) {
      return json({ error: "Unable to create account. Check whether the email is already in use." }, 409);
    }

    const userId = newUser.user?.id;
    if (!userId) return json({ error: "Unable to create account" }, 500);

    // Auth and Postgres writes are separate operations; remove the new Auth user
    // if either authorization record cannot be completed.
    const { error: profileError } = await serviceClient
      .from("profiles")
      .upsert(
        {
          user_id: userId,
          restaurant_id: restaurantId,
          display_name: displayName || email.split("@")[0],
        },
        { onConflict: "user_id" }
      );
    if (profileError) {
      await serviceClient.auth.admin.deleteUser(userId);
      console.error("admin profile provisioning failed", profileError.code || "unknown");
      return json({ error: "Account provisioning failed" }, 500);
    }

    const { error: roleInsertError } = await serviceClient.from("user_roles").insert({
      user_id: userId,
      role: "restaurant_admin",
      is_active: true,
    });
    if (roleInsertError) {
      const { error: profileDeleteError } = await serviceClient.from("profiles").delete().eq("user_id", userId);
      const { error: authDeleteError } = await serviceClient.auth.admin.deleteUser(userId);
      console.error("admin role provisioning failed", roleInsertError.code || "unknown", profileDeleteError?.code || "", authDeleteError?.message ? "auth rollback failed" : "");
      return json({ error: "Account provisioning failed" }, 500);
    }

    return json({ success: true, user_id: userId });
  } catch (error) {
    console.error("admin account provisioning failed", error instanceof Error ? error.name : "unknown");
    return json({ error: "Internal error" }, 500);
  }
});
