import type { Session } from "@supabase/supabase-js";

const PROFILE_SEED_KEY = "rzfood_profile_seed";

export interface ProfileSeed {
  displayName?: string;
  phone?: string;
}

function cleanString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function buildProfileSeedFromSession(session: Session | null): ProfileSeed | null {
  if (!session?.user) return null;

  const metadata = (session.user.user_metadata ?? {}) as Record<string, unknown>;

  const displayName =
    cleanString(metadata.full_name) ||
    cleanString(metadata.name) ||
    cleanString(metadata.display_name) ||
    [cleanString(metadata.given_name), cleanString(metadata.family_name)].filter(Boolean).join(" ") ||
    undefined;

  const phone =
    cleanString(session.user.phone) ||
    cleanString(metadata.phone) ||
    cleanString(metadata.phone_number) ||
    cleanString(metadata.phoneNumber) ||
    cleanString(metadata.mobile) ||
    undefined;

  if (!displayName && !phone) return null;
  return { displayName, phone };
}

export function setProfileSeed(session: Session | null): void {
  if (typeof window === "undefined") return;
  const seed = buildProfileSeedFromSession(session);
  if (!seed) return;
  sessionStorage.setItem(PROFILE_SEED_KEY, JSON.stringify(seed));
}

export function getProfileSeed(): ProfileSeed | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(PROFILE_SEED_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as ProfileSeed;
    const displayName = cleanString(parsed?.displayName);
    const phone = cleanString(parsed?.phone);
    if (!displayName && !phone) return null;
    return { displayName, phone };
  } catch {
    return null;
  }
}

export function clearProfileSeed(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(PROFILE_SEED_KEY);
}
