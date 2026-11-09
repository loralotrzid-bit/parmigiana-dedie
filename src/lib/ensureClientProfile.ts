import type { Session } from "@supabase/supabase-js";
import { isValidSession } from "@/lib/authSession";
import { directSelect, directInsert, directUpdate } from "@/lib/directSupabaseRest";

/**
 * Ensures a client profile row exists after OAuth/password login.
 * Uses direct REST calls to avoid LockManager contention after OAuth redirect.
 * Fire-and-forget friendly: safe to call without awaiting in UI flows.
 */
export async function ensureClientProfile(
  session: Session | { access_token: string; user: { id: string; email?: string; phone?: string; user_metadata: Record<string, unknown> } } | null
): Promise<void> {
  if (!session || !("user" in session) || !session.user?.id) return;
  if ("is_anonymous" in session.user && session.user.is_anonymous) return;

  const accessToken = session.access_token;
  const metadata = session.user.user_metadata ?? {};

  const displayNameCandidates = [
    metadata.full_name,
    metadata.name,
    metadata.display_name,
    [metadata.given_name, metadata.family_name].filter((part): part is string => typeof part === "string" && part.trim().length > 0).join(" "),
  ];

  const displayName = displayNameCandidates.find(
    (value): value is string => typeof value === "string" && value.trim().length > 0
  )?.trim() ?? null;

  const phoneCandidates = [
    session.user.phone,
    metadata.phone,
    metadata.phone_number,
    metadata.phoneNumber,
    metadata.mobile,
  ];

  const phone = phoneCandidates.find(
    (value): value is string => typeof value === "string" && value.trim().length > 0
  )?.trim() ?? null;

  try {
    const rows = await directSelect<{ id: string; display_name: string | null; phone: string | null }>(
      "profiles",
      `user_id=eq.${session.user.id}&select=id,display_name,phone&limit=1`,
      accessToken
    );

    const existing = rows[0] ?? null;

    if (existing) {
      const patch: Record<string, unknown> = {};
      if (displayName && !existing.display_name?.trim()) patch.display_name = displayName;
      if (phone && !existing.phone?.trim()) patch.phone = phone;

      if (Object.keys(patch).length > 0) {
        await directUpdate("profiles", `user_id=eq.${session.user.id}`, patch, accessToken);
      }
      console.log("[ensureClientProfile] Profile ensured");
      return;
    }

    // Insert new profile
    const payload: Record<string, unknown> = { user_id: session.user.id };
    if (displayName) payload.display_name = displayName;
    if (phone) payload.phone = phone;

    await directInsert("profiles", payload, accessToken);
    console.log("[ensureClientProfile] Profile created");
  } catch (err) {
    console.warn("[ensureClientProfile] Failed:", err);
  }
}
