import { createClient } from "https://esm.sh/@supabase/supabase-js@2.96.0";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.96.0";
import { consumeRequestRateLimit } from "../_shared/requestRateLimit.ts";

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

// ── AES-GCM encryption for TOTP secrets ─────────────────────────
async function getEncryptionKey(): Promise<CryptoKey> {
  const rawKey = Deno.env.get("TOTP_ENCRYPTION_KEY");
  if (!rawKey || rawKey.length < 32) {
    throw new Error("TOTP_ENCRYPTION_KEY must be at least 32 characters");
  }
  const keyBytes = new TextEncoder().encode(rawKey.slice(0, 32));
  return crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function encryptSecret(plaintext: string): Promise<string> {
  const key = await getEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  // Store as: base64(iv + ciphertext)
  const combined = new Uint8Array(iv.length + new Uint8Array(ciphertext).length);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return btoa(String.fromCharCode(...combined));
}

async function decryptSecret(encrypted: string): Promise<string> {
  const key = await getEncryptionKey();
  const combined = Uint8Array.from(atob(encrypted), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return new TextDecoder().decode(decrypted);
}

// ── Base32 encoding/decoding ─────────────────────────────────────
const BASE32_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(buffer: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_CHARS[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_CHARS[(value << (5 - bits)) & 31];
  }
  return output;
}

function base32Decode(input: string): Uint8Array {
  const cleaned = input.replace(/[=\s]/g, "").toUpperCase();
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;
  for (const char of cleaned) {
    const idx = BASE32_CHARS.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(bytes);
}

// ── TOTP implementation (RFC 6238) ───────────────────────────────
async function generateTOTP(secret: string, timeStep = 30, digits = 6): Promise<string> {
  const key = base32Decode(secret);
  const epoch = Math.floor(Date.now() / 1000);
  const counter = Math.floor(epoch / timeStep);

  const counterBytes = new Uint8Array(8);
  let tmp = counter;
  for (let i = 7; i >= 0; i--) {
    counterBytes[i] = tmp & 0xff;
    tmp = Math.floor(tmp / 256);
  }

  const cryptoKey = await crypto.subtle.importKey(
    "raw", new Uint8Array(key).buffer, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, counterBytes);
  const hmac = new Uint8Array(signature);

  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = (
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff)
  ) % Math.pow(10, digits);

  return code.toString().padStart(digits, "0");
}

async function verifyTOTP(secret: string, token: string, window = 1): Promise<boolean> {
  const epoch = Math.floor(Date.now() / 1000);
  for (let i = -window; i <= window; i++) {
    const timeStep = 30;
    const counter = Math.floor(epoch / timeStep) + i;

    const counterBytes = new Uint8Array(8);
    let tmp = counter;
    for (let j = 7; j >= 0; j--) {
      counterBytes[j] = tmp & 0xff;
      tmp = Math.floor(tmp / 256);
    }

    const key = base32Decode(secret);
    const cryptoKey = await crypto.subtle.importKey(
      "raw", new Uint8Array(key).buffer, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]
    );
    const signature = await crypto.subtle.sign("HMAC", cryptoKey, counterBytes);
    const hmac = new Uint8Array(signature);

    const offset = hmac[hmac.length - 1] & 0x0f;
    const code = (
      ((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff)
    ) % 1000000;

    if (code.toString().padStart(6, "0") === token) {
      return true;
    }
  }
  return false;
}

// ── Durable TOTP attempt limit, shared across Edge instances ─────
async function totpLimitResponse(db: SupabaseClient, userId: string): Promise<Response | null> {
  try {
    const allowed = await consumeRequestRateLimit(
      db, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, "totp-verify", userId, 5, 300,
    );
    return allowed ? null : json({ error: "Trop de tentatives. Réessayez dans quelques minutes." }, 429);
  } catch {
    return json({ error: "Service de vérification temporairement indisponible." }, 503);
  }
}

/** Try to decrypt; if it fails, treat value as legacy plaintext base32 */
async function getPlaintextSecret(storedValue: string): Promise<string> {
  try {
    return await decryptSecret(storedValue);
  } catch {
    // Legacy unencrypted value — return as-is
    return storedValue;
  }
}

// ── Main handler ────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const rawBody = await req.text();
    if (rawBody.length > 5000) {
      return json({ error: "Payload trop volumineux" }, 413);
    }

    let body: Record<string, unknown>;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return json({ error: "JSON invalide" }, 400);
    }

    const { action } = body;
    const validActions = ["setup", "verify_setup", "validate", "disable", "status"];
    if (!action || !validActions.includes(action as string)) {
      return json({ error: "Action inconnue" }, 400);
    }

    // ── Authenticate user via JWT ───────────────────────────────
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return json({ error: "Non autorisé" }, 401);
    }

    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userErr } = await supabaseAuth.auth.getUser();
    if (userErr || !user) {
      return json({ error: "Non autorisé" }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ── Verify user is admin ────────────────────────────────────
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("is_active", true);

    const isAdmin = (roles || []).some((role) => role.role === "restaurant_admin" || role.role === "super_admin");

    if (!isAdmin) {
      return json({ error: "Accès refusé" }, 403);
    }

    // ── ACTION: Get 2FA status ──────────────────────────────────
    if (action === "status") {
      const { data: totp } = await supabase
        .from("totp_secrets")
        .select("is_enabled")
        .eq("user_id", user.id)
        .maybeSingle();

      return json({ enabled: totp?.is_enabled ?? false });
    }

    // ── ACTION: Setup — generate new secret ─────────────────────
    if (action === "setup") {
      const secretBytes = new Uint8Array(20);
      crypto.getRandomValues(secretBytes);
      const secret = base32Encode(secretBytes);

      // Encrypt before storing
      const encrypted = await encryptSecret(secret);

      await supabase
        .from("totp_secrets")
        .upsert({
          user_id: user.id,
          encrypted_secret: encrypted,
          is_enabled: false,
        }, { onConflict: "user_id" });

      const issuer = "RZFood Admin";
      const accountName = user.email || user.id;
      const otpauthUri = `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(accountName)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;

      return json({ secret, otpauth_uri: otpauthUri });
    }

    // ── ACTION: Verify setup — confirm with a valid token ───────
    if (action === "verify_setup") {
      const token = body.token;
      if (typeof token !== "string" || !/^\d{6}$/.test(token)) {
        return json({ error: "Code invalide (6 chiffres requis)" }, 400);
      }

      const limitResponse = await totpLimitResponse(supabase, user.id);
      if (limitResponse) return limitResponse;

      const { data: totp } = await supabase
        .from("totp_secrets")
        .select("encrypted_secret")
        .eq("user_id", user.id)
        .single();

      if (!totp) {
        return json({ error: "Aucune configuration 2FA trouvée. Lancez le setup d'abord." }, 400);
      }

      const plainSecret = await getPlaintextSecret(totp.encrypted_secret);
      const valid = await verifyTOTP(plainSecret, token);
      if (!valid) {
        return json({ error: "Code incorrect. Vérifiez l'heure de votre appareil." }, 400);
      }

      await supabase
        .from("totp_secrets")
        .update({ is_enabled: true })
        .eq("user_id", user.id);

      return json({ success: true, message: "2FA activé avec succès" });
    }

    // ── ACTION: Validate — check token during login ─────────────
    if (action === "validate") {
      const token = body.token;
      if (typeof token !== "string" || !/^\d{6}$/.test(token)) {
        return json({ error: "Code invalide" }, 400);
      }

      const limitResponse = await totpLimitResponse(supabase, user.id);
      if (limitResponse) return limitResponse;

      const { data: totp } = await supabase
        .from("totp_secrets")
        .select("encrypted_secret, is_enabled")
        .eq("user_id", user.id)
        .single();

      if (!totp || !totp.is_enabled) {
        return json({ error: "2FA non activé" }, 400);
      }

      const plainSecret = await getPlaintextSecret(totp.encrypted_secret);
      const valid = await verifyTOTP(plainSecret, token);
      if (!valid) {
        return json({ valid: false, error: "Code incorrect" }, 400);
      }

      return json({ valid: true });
    }

    // ── ACTION: Disable 2FA ─────────────────────────────────────
    if (action === "disable") {
      const token = body.token;
      if (typeof token !== "string" || !/^\d{6}$/.test(token)) {
        return json({ error: "Code requis pour désactiver le 2FA" }, 400);
      }

      const limitResponse = await totpLimitResponse(supabase, user.id);
      if (limitResponse) return limitResponse;

      const { data: totp } = await supabase
        .from("totp_secrets")
        .select("encrypted_secret")
        .eq("user_id", user.id)
        .single();

      if (!totp) {
        return json({ error: "2FA non configuré" }, 400);
      }

      const plainSecret = await getPlaintextSecret(totp.encrypted_secret);
      const valid = await verifyTOTP(plainSecret, token);
      if (!valid) {
        return json({ error: "Code incorrect" }, 400);
      }

      await supabase
        .from("totp_secrets")
        .delete()
        .eq("user_id", user.id);

      return json({ success: true, message: "2FA désactivé" });
    }

    return json({ error: "Action inconnue" }, 400);
  } catch (err) {
    console.error("totp-api error:", err);
    return json({ error: "Erreur interne" }, 500);
  }
});
