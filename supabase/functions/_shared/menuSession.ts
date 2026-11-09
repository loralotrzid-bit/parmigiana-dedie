import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.96.0";

export async function hashToken(token: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function resolveMenuSession(db: SupabaseClient, token: unknown) {
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) return null;
  const { data, error } = await db.from("digital_menu_sessions").select("*")
    .eq("token_hash", await hashToken(token)).gt("expires_at", new Date().toISOString()).maybeSingle();
  if (error) throw error;
  return data;
}
