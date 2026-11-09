import { createClient } from "https://esm.sh/@supabase/supabase-js@2.96.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify caller is super_admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Non autorisé" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify the caller with anon client
    const anonClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await anonClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Non autorisé" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check super_admin role
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: roles } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "super_admin")
      .eq("is_active", true);

    if (!roles || roles.length === 0) {
      return new Response(JSON.stringify({ error: "Accès super admin requis" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { sql } = body;

    if (!sql || typeof sql !== "string" || sql.trim().length === 0) {
      return new Response(JSON.stringify({ error: "SQL requis" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Safety: block dangerous operations
    const upperSql = sql.toUpperCase().trim();
    const forbidden = ["DROP DATABASE", "DROP SCHEMA", "ALTER DATABASE", "TRUNCATE", "CREATE ROLE", "ALTER ROLE", "DROP ROLE", "GRANT", "REVOKE"];
    for (const f of forbidden) {
      if (upperSql.includes(f)) {
        return new Response(JSON.stringify({ error: `Opération interdite: ${f}` }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Execute SQL using the Postgres connection
    const dbUrl = Deno.env.get("SUPABASE_DB_URL")!;
    
    // Use pg from deno
    const { default: postgres } = await import("https://deno.land/x/postgresjs@v3.4.5/mod.js");
    const pg = postgres(dbUrl, { max: 1 });

    try {
      const result = await pg.unsafe(sql);
      const rows = Array.isArray(result) ? result : [];
      
      return new Response(JSON.stringify({ 
        success: true, 
        rows,
        count: rows.length,
        message: `${rows.length} ligne(s) affectée(s)` 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } finally {
      await pg.end();
    }
  } catch (error: unknown) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Erreur SQL" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
