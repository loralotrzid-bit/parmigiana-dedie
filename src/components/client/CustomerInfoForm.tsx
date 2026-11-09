import { useState, useEffect } from "react";
import { User, Phone, Mail, Building2, Loader2 } from "lucide-react";
import { getSavedAddress, setSavedAddress } from "@/lib/savedAddress";
import DeliveryAddressInput, { AddressData } from "@/components/client/DeliveryAddressInput";

export interface CustomerInfo {
  name: string;
  phone: string;
  email: string;
  address?: string;
  lat?: number;
  lng?: number;
}

interface CustomerInfoFormProps {
  onSubmit: (info: CustomerInfo) => void;
  initialValues?: Partial<CustomerInfo>;
  showAddress?: boolean;
  optionalContact?: boolean;
  inlineOptional?: boolean;
  onOptionalChange?: (info: CustomerInfo, saveForRewards: boolean) => void;
}

const GUEST_STORAGE_KEY = "rz_guest_checkout";

function loadGuestInfo(): Partial<CustomerInfo> {
  try {
    const raw = localStorage.getItem(GUEST_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveGuestInfo(info: CustomerInfo) {
  try {
    localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify({
      name: info.name,
      phone: info.phone,
      email: info.email,
      address: info.address,
    }));
  } catch { /* silent */ }
}

const CustomerInfoForm = ({ onSubmit, initialValues, showAddress, optionalContact = false, inlineOptional = false, onOptionalChange }: CustomerInfoFormProps) => {
  const saved = showAddress ? getSavedAddress() : null;
  const guest = loadGuestInfo();
  const defaults = { ...guest, ...initialValues };

  const [name, setName] = useState(defaults.name || "");
  const [phone, setPhone] = useState(defaults.phone || "");
  const [email, setEmail] = useState(defaults.email || "");
  const [selectedAddress, setSelectedAddress] = useState<AddressData | null>(saved || null);
  const [complement, setComplement] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveForRewards, setSaveForRewards] = useState(false);

  useEffect(() => {
    if (!inlineOptional) return;
    const info: CustomerInfo = {
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim(),
      ...(selectedAddress ? { address: complement.trim() ? `${selectedAddress.display_name}, ${complement.trim()}` : selectedAddress.display_name, lat: selectedAddress.lat, lng: selectedAddress.lng } : {}),
    };
    onOptionalChange?.(info, saveForRewards);
    if (saveForRewards && (info.name || info.phone || info.email)) saveGuestInfo(info);
  }, [inlineOptional, name, phone, email, selectedAddress, complement, saveForRewards, onOptionalChange]);

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
    if (!optionalContact && !name.trim()) e.name = "Nom requis";
    if (!optionalContact && (!phone.trim() || phone.trim().length < 8)) e.phone = "Numéro invalide";
    if (optionalContact && phone.trim() && !/^[+\d\s().-]{8,25}$/.test(phone.trim())) e.phone = "Numéro invalide";
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) e.email = "Email invalide";
    if (showAddress && !optionalContact && !selectedAddress) e.address = "Adresse de livraison requise";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;

    let info: CustomerInfo;

    if (showAddress && selectedAddress) {
      const fullAddress = complement.trim()
        ? `${selectedAddress.display_name}, ${complement.trim()}`
        : selectedAddress.display_name;

      info = {
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim(),
        address: fullAddress,
        lat: selectedAddress.lat,
        lng: selectedAddress.lng,
      };
    } else {
      info = {
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim(),
      };
    }

    if (!optionalContact || saveForRewards) saveGuestInfo(info);
    onSubmit(info);
  };

  return (
    <div className="rounded-xl border bg-card p-4 shadow-card">
      <h3 className="mb-3 text-sm font-bold text-card-foreground">Vos coordonnées</h3>
      {optionalContact && <p className="mb-4 text-sm text-muted-foreground">Facultatif : vous pouvez commander sans renseigner vos coordonnées.</p>}
      <div className="space-y-3">
        <div>
          <div className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2.5">
            <User className="h-4 w-4 text-muted-foreground" />
            <input type="text" aria-label={optionalContact ? "Votre nom (facultatif)" : "Votre nom"} placeholder={optionalContact ? "Votre nom (facultatif)" : "Votre nom"} value={name} onChange={(e) => setName(e.target.value)}
              className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground" />
          </div>
          {errors.name && <p className="mt-1 text-xs text-destructive">{errors.name}</p>}
        </div>
        <div>
          <div className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2.5">
            <Phone className="h-4 w-4 text-muted-foreground" />
            <input type="tel" aria-label={optionalContact ? "Téléphone (facultatif)" : "Numéro de téléphone"} placeholder={optionalContact ? "Téléphone (facultatif)" : "Numéro de téléphone"} value={phone} onChange={(e) => setPhone(e.target.value)}
              className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground" />
          </div>
          {errors.phone && <p className="mt-1 text-xs text-destructive">{errors.phone}</p>}
        </div>
        <div>
          <div className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2.5">
            <Mail className="h-4 w-4 text-muted-foreground" />
            <input type="email" aria-label="Adresse email (facultatif)" placeholder="Adresse email (facultatif)" value={email} onChange={(e) => setEmail(e.target.value)}
              className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground" />
          </div>
          {errors.email && <p className="mt-1 text-xs text-destructive">{errors.email}</p>}
        </div>
        {showAddress && (
          <>
            <div className="border-t pt-3">
              <p className="text-xs font-bold text-card-foreground mb-2">Adresse de livraison</p>
              <DeliveryAddressInput
                selected={selectedAddress}
                onSelect={handleAddressSelect}
                onClear={handleAddressClear}
              />
              {errors.address && <p className="mt-1 text-xs text-destructive">{errors.address}</p>}
            </div>
            <div>
              <div className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2.5">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <input type="text" placeholder="Boîte, étage, bâtiment… (facultatif)" value={complement} onChange={(e) => setComplement(e.target.value)}
                  className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground" />
              </div>
            </div>
          </>
        )}
      </div>
      {optionalContact && <label className="mt-4 flex items-start gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={saveForRewards} onChange={(e) => setSaveForRewards(e.target.checked)} className="mt-0.5" /><span>Enregistrer ces coordonnées sur cet appareil pour mes prochaines commandes et les futures récompenses. Programme de récompenses pas encore actif.</span></label>}
      {!inlineOptional && <button onClick={handleSubmit}
        className="mt-4 w-full rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground transition-transform active:scale-[0.98] disabled:opacity-60">
        Confirmer
      </button>}
      {optionalContact && !inlineOptional && <button type="button" onClick={() => onSubmit({ name: "", phone: "", email: "" })} className="mt-3 w-full rounded-xl border py-3 text-sm font-semibold">Continuer sans coordonnées</button>}
    </div>
  );
};

export default CustomerInfoForm;
