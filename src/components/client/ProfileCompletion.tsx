import { useState, useEffect, useCallback, useRef } from "react";
import { User, Phone, Building2, Loader2, MapPin } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { getSavedAddress, setSavedAddress } from "@/lib/savedAddress";
import DeliveryAddressInput, { AddressData } from "@/components/client/DeliveryAddressInput";
import { getCurrentSession, isValidSession } from "@/lib/authSession";
import { getProfileSeed } from "@/lib/profileSeed";

export interface ProfileData {
  displayName: string;
  phone: string;
  address?: string;
  lat?: number;
  lng?: number;
}

interface ProfileCompletionProps {
  onComplete: (data: ProfileData) => void;
  /** Is this order a delivery? If yes, address is required */
  isDelivery?: boolean;
  sessionHint?: Session | null;
}

const ProfileCompletion = ({ onComplete, isDelivery = false, sessionHint = null }: ProfileCompletionProps) => {
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [selectedAddress, setSelectedAddress] = useState<AddressData | null>(null);
  const [complement, setComplement] = useState("");

  const getActiveSession = useCallback(async (): Promise<Session | null> => {
    if (isValidSession(sessionHint)) {
      return sessionHint;
    }

    const resolved = await getCurrentSession({
      allowRefresh: true,
      allowStorageFallback: true,
    });
    if (isValidSession(resolved)) return resolved;

    return null;
  }, [sessionHint]);

  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);

  useEffect(() => {
    let cancelled = false;

    const loadProfile = async () => {
      setLoading(true);

      try {
        const seed = getProfileSeed();
        if (seed?.displayName) setDisplayName((prev) => prev || seed.displayName || "");
        if (seed?.phone) setPhone((prev) => prev || seed.phone || "");

        const session = await getActiveSession();
        if (cancelled) return;

        if (!isValidSession(session)) {
          setLoading(false);
          return;
        }

        const userId = session.user.id;
        console.log("[ProfileCompletion] Loading profile for:", userId);

        const { data: profile, error: profileErr } = await supabase
          .from("profiles")
          .select("display_name, phone")
          .eq("user_id", userId)
          .maybeSingle();

        if (cancelled) return;
        if (profileErr) console.warn("[ProfileCompletion] Profile fetch error:", profileErr.message);

        const meta = (session.user.user_metadata ?? {}) as Record<string, unknown>;
        const inferredName = [
          meta.full_name,
          meta.name,
          meta.display_name,
          [meta.given_name, meta.family_name]
            .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
            .join(" "),
        ]
          .find((value): value is string => typeof value === "string" && value.trim().length > 0)
          ?.trim() ?? "";

        const inferredPhone = [
          session.user.phone,
          meta.phone,
          meta.phone_number,
          meta.phoneNumber,
          meta.mobile,
        ]
          .find((value): value is string => typeof value === "string" && value.trim().length > 0)
          ?.trim() ?? "";

        const resolvedDisplayName = profile?.display_name?.trim() || inferredName;
        const resolvedPhone = profile?.phone?.trim() || inferredPhone;

        if (resolvedDisplayName) setDisplayName(resolvedDisplayName);
        if (resolvedPhone) setPhone(resolvedPhone);

        const savedAddr = getSavedAddress();
        if (savedAddr) setSelectedAddress(savedAddr);

        const hasName = resolvedDisplayName.length > 0;
        const hasPhone = resolvedPhone.length > 0;
        if (hasName && hasPhone) {
          if (!isDelivery || savedAddr) {
            const fullAddress = savedAddr ? savedAddr.display_name : undefined;
            onCompleteRef.current({
              displayName: resolvedDisplayName,
              phone: resolvedPhone,
              address: fullAddress,
              lat: savedAddr?.lat,
              lng: savedAddr?.lng,
            });
            setLoading(false);
            return;
          }
        }

        setLoading(false);
      } catch (err) {
        console.warn("[ProfileCompletion] loadProfile failed:", err);
        if (!cancelled) setLoading(false);
      }
    };

    void loadProfile();
    return () => { cancelled = true; };
  }, [getActiveSession, isDelivery, sessionHint?.user?.id]);

  const handleAddressSelect = (addr: AddressData) => {
    setSelectedAddress(addr);
    setSavedAddress(addr);
    setErrors((prev) => {
      const { address, ...rest } = prev;
      return rest;
    });
  };

  const handleAddressClear = () => {
    setSelectedAddress(null);
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!displayName.trim()) e.name = "Nom requis";
    if (!phone.trim() || phone.trim().length < 8) e.phone = "Numéro invalide";
    if (isDelivery && !selectedAddress) e.address = "Adresse de livraison requise";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSaving(true);

    setErrors((prev) => {
      const { auth, ...rest } = prev;
      return rest;
    });

    try {
      const session = await getActiveSession();
      if (!isValidSession(session)) {
        setErrors((prev) => ({ ...prev, auth: "Session expirée. Reconnectez-vous." }));
        return;
      }

      const userId = session.user.id;
      const payload = { display_name: displayName.trim(), phone: phone.trim() };

      const { error: saveErr } = await supabase
        .from("profiles")
        .upsert({ user_id: userId, ...payload }, { onConflict: "user_id" });

      if (saveErr) {
        console.warn("[ProfileCompletion] Save failed:", saveErr.message);
        setErrors((prev) => ({ ...prev, auth: "Impossible d'enregistrer vos informations. Réessayez." }));
        return;
      }

      let fullAddress: string | undefined;
      if (selectedAddress) {
        fullAddress = complement.trim()
          ? `${selectedAddress.display_name}, ${complement.trim()}`
          : selectedAddress.display_name;
      }

      onComplete({
        displayName: displayName.trim(),
        phone: phone.trim(),
        address: fullAddress,
        lat: selectedAddress?.lat,
        lng: selectedAddress?.lng,
      });
    } catch (err) {
      console.warn("[ProfileCompletion] Submit failed:", err);
      setErrors((prev) => ({ ...prev, auth: "Erreur temporaire. Réessayez." }));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card p-4 shadow-card animate-fade-in">
      <h3 className="mb-1 text-sm font-bold text-card-foreground">Vos informations</h3>
      <p className="mb-4 text-xs text-muted-foreground">
        Vérifiez vos informations avant de continuer.
      </p>

      <div className="space-y-3">
        {/* Name */}
        <div>
          <div className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2.5">
            <User className="h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Nom et prénom"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
          </div>
          {errors.name && <p className="mt-1 text-xs text-destructive">{errors.name}</p>}
        </div>

        {/* Phone */}
        <div>
          <div className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2.5">
            <Phone className="h-4 w-4 text-muted-foreground" />
            <input
              type="tel"
              placeholder="Numéro de téléphone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
          </div>
          {errors.phone && <p className="mt-1 text-xs text-destructive">{errors.phone}</p>}
        </div>

        {/* Address — always visible */}
        <div className="border-t pt-3">
          <p className="text-xs font-bold text-card-foreground mb-1 flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" />
            Adresse de livraison
            {!isDelivery && <span className="font-normal text-muted-foreground ml-1">(facultatif)</span>}
          </p>
          <DeliveryAddressInput
            selected={selectedAddress}
            onSelect={handleAddressSelect}
            onClear={handleAddressClear}
          />
          {errors.address && <p className="mt-1 text-xs text-destructive">{errors.address}</p>}
        </div>

        {/* Address complement */}
        <div>
          <div className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2.5">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Boîte, étage, bâtiment… (facultatif)"
              value={complement}
              onChange={(e) => setComplement(e.target.value)}
              className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
          </div>
        </div>
      </div>

      {errors.auth && <p className="mt-3 text-xs text-destructive">{errors.auth}</p>}

      <button
        onClick={handleSubmit}
        disabled={saving}
        className="mt-4 w-full rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground transition-transform active:scale-[0.98] disabled:opacity-60"
      >
        {saving ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : "Continuer"}
      </button>
    </div>
  );
};

export default ProfileCompletion;
