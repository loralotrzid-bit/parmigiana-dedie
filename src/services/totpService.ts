import { supabase } from "@/integrations/supabase/client";

async function callTotpApi(action: string, extra: Record<string, unknown> = {}) {
  const { data, error } = await supabase.functions.invoke("totp-api", {
    body: { action, ...extra },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function getTotpStatus(): Promise<boolean> {
  const data = await callTotpApi("status");
  return data.enabled;
}

export async function setupTotp(): Promise<{ secret: string; otpauth_uri: string }> {
  return callTotpApi("setup");
}

export async function verifyTotpSetup(token: string): Promise<void> {
  await callTotpApi("verify_setup", { token });
}

export async function validateTotp(token: string): Promise<boolean> {
  const data = await callTotpApi("validate", { token });
  return data.valid;
}

export async function disableTotp(token: string): Promise<void> {
  await callTotpApi("disable", { token });
}
