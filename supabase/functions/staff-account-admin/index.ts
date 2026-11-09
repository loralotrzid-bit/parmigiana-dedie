import { createClient } from "https://esm.sh/@supabase/supabase-js@2.96.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const raw = await req.text();
    if (raw.length > 4_000) return json({ error: "Requête trop volumineuse" }, 413);
    let body: Record<string, unknown>;
    try { body = JSON.parse(raw); } catch { return json({ error: "JSON invalide" }, 400); }
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Connexion requise" }, 401);

    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: authData, error: authError } = await service.auth.getUser(token);
    if (authError || !authData.user || authData.user.is_anonymous) return json({ error: "Connexion requise" }, 401);
    const userId = authData.user.id;
    const { data: roles, error: roleError } = await service.from("user_roles").select("role")
      .eq("user_id", userId).eq("is_active", true);
    if (roleError) throw roleError;
    const superAdmin = roles?.some((r) => r.role === "super_admin") === true;
    const restaurantAdmin = roles?.some((r) => r.role === "restaurant_admin") === true;
    if (!superAdmin && !restaurantAdmin) return json({ error: "Accès refusé" }, 403);

    const { data: profile } = await service.from("profiles").select("restaurant_id").eq("user_id", userId).maybeSingle();
    const restaurantId = typeof body.restaurant_id === "string" ? body.restaurant_id : "";
    const driverId = typeof body.driver_id === "string" ? body.driver_id : "";
    if (!restaurantId || !driverId) return json({ error: "Restaurant ou profil livreur invalide" }, 400);
    if (!superAdmin && profile?.restaurant_id !== restaurantId) return json({ error: "Accès refusé pour ce restaurant" }, 403);
    const { data: driver, error: driverError } = await service.from("delivery_drivers")
      .select("id,restaurant_id,full_name,auth_user_id,email,is_active")
      .eq("id", driverId).eq("restaurant_id", restaurantId).maybeSingle();
    if (driverError) throw driverError;
    if (!driver) return json({ error: "Profil personnel introuvable" }, 404);
    if (!driver.is_active) return json({ error: "Réactivez le profil avant de créer son accès" }, 409);
    if (driver.auth_user_id) return json({ error: "Ce profil possède déjà un compte. Utilisez le bouton de réinitialisation." }, 409);

    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Adresse e-mail invalide" }, 400);
    const siteUrl = Deno.env.get("SITE_URL") || "http://127.0.0.1:8082";
    const redirectTo = new URL("/reset-password", siteUrl).toString();
    const { data: invite, error: inviteError } = await service.auth.admin.inviteUserByEmail(email, {
      data: { display_name: driver.full_name, staff_account: true, staff_restaurant_id: restaurantId },
      redirectTo,
    });
    if (inviteError || !invite.user) {
      console.error("staff invite failed", inviteError?.message);
      return json({ error: "Invitation impossible. Vérifiez que cette adresse n’a pas déjà un compte et la configuration e-mail Supabase." }, 409);
    }

    const { error: linkError } = await service.from("delivery_drivers").update({
      auth_user_id: invite.user.id, email,
    }).eq("id", driverId).eq("restaurant_id", restaurantId).is("auth_user_id", null);
    if (linkError) {
      console.error("staff invite link failed", linkError.message);
      return json({ error: "Invitation envoyée mais liaison du profil incomplète. Contactez le superadmin." }, 500);
    }
    return json({ success: true, email });
  } catch (error) {
    console.error("staff account admin error", error instanceof Error ? error.message : "unknown");
    return json({ error: "Erreur interne pendant la gestion du compte personnel" }, 500);
  }
});
