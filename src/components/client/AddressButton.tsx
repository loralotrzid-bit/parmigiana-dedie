import { MapPin, X } from "lucide-react";
import { useState } from "react";
import DeliveryAddressInput from "@/components/client/DeliveryAddressInput";
import { getSavedAddress, setSavedAddress, type SavedAddress } from "@/lib/savedAddress";

interface Props {
  compact?: boolean;
}

const AddressButton = ({ compact }: Props) => {
  const [saved, setSaved] = useState<SavedAddress | null>(getSavedAddress);
  const [showPopup, setShowPopup] = useState(false);

  const handleSelect = (addr: SavedAddress) => {
    setSavedAddress(addr);
    setSaved(addr);
    setShowPopup(false);
  };

  const handleClear = () => {
    setSavedAddress(null);
    setSaved(null);
  };

  if (saved && !showPopup) {
    return (
      <button
        onClick={() => setShowPopup(true)}
        className="flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors max-w-[200px] shadow-sm"
      >
        <MapPin className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{saved.display_name.split(",")[0]}</span>
        <span
          role="button"
          onClick={(e) => { e.stopPropagation(); handleClear(); }}
          className="shrink-0 text-primary-foreground/70 hover:text-primary-foreground"
        >
          <X className="h-3 w-3" />
        </span>
      </button>
    );
  }

  return (
    <>
      <button
        onClick={() => setShowPopup(true)}
        className="flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
      >
        <MapPin className="h-3.5 w-3.5" />
        {compact ? "Adresse" : "Livrer à"}
      </button>

      {showPopup && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-foreground/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-card p-5 shadow-elevated">
            <h3 className="mb-3 text-sm font-bold text-card-foreground">Adresse de livraison</h3>
            <DeliveryAddressInput
              selected={saved}
              onSelect={handleSelect}
              onClear={handleClear}
            />
            <button
              onClick={() => setShowPopup(false)}
              className="mt-3 w-full rounded-lg border py-2 text-xs font-semibold text-muted-foreground hover:bg-accent"
            >
              Fermer
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default AddressButton;
