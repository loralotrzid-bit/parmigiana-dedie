import { useState, useCallback, useRef, useEffect } from "react";
import { MapPin, Search, X, Loader2, LocateFixed, Pencil, CheckCircle2 } from "lucide-react";
import { searchAddress, reverseGeocode, geocodeAddress, setSearchBias } from "@/lib/geo";
import { Input } from "@/components/ui/input";
import { safeToast } from "@/lib/safeToast";

export interface AddressData {
  display_name: string;
  lat: number;
  lng: number;
  street?: string;
  house_number?: string;
  postcode?: string;
  city?: string;
}

interface Props {
  onSelect: (addr: AddressData) => void;
  onClear: () => void;
  selected: AddressData | null;
}

const DeliveryAddressInput = ({ onSelect, onClear, selected }: Props) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AddressData[]>([]);
  const [loading, setLoading] = useState(false);
  const [noResults, setNoResults] = useState(false);
  const [locating, setLocating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [geocoding, setGeocoding] = useState(false);

  // Structured edit fields
  const [editStreet, setEditStreet] = useState("");
  const [editNumber, setEditNumber] = useState("");
  const [editPostcode, setEditPostcode] = useState("");
  const [editCity, setEditCity] = useState("");
  const [editError, setEditError] = useState("");

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  /**
   * Geolocation — called DIRECTLY from the button click handler.
   * No async before getCurrentPosition to ensure Safari user-gesture compliance.
   */
  const handleGeolocate = () => {
    if (!navigator.geolocation) {
      safeToast.error("La géolocalisation n'est pas supportée par votre navigateur.");
      return;
    }

    setLocating(true);
    // CRITICAL: No await before this — must stay in user gesture context for Safari/iOS
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setSearchBias(pos.coords.latitude, pos.coords.longitude);
        const result = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
        setLocating(false);
        if (result) {
          onSelect(result);
          setQuery("");
          setResults([]);
          setNoResults(false);
          setEditing(false);
        } else {
          safeToast.error("Impossible de trouver votre adresse. Essayez manuellement.");
        }
      },
      (err) => {
        setLocating(false);
        
        switch (err.code) {
          case err.PERMISSION_DENIED:
            safeToast.error("Accès à la position refusé. Autorisez la géolocalisation dans les paramètres.");
            break;
          case err.POSITION_UNAVAILABLE:
            safeToast.error("Position indisponible. Vérifiez que la localisation est activée.");
            break;
          case err.TIMEOUT:
            safeToast.error("Délai dépassé. Réessayez.");
            break;
          default:
            safeToast.error("Impossible d'obtenir votre position.");
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const handleSearch = useCallback((q: string) => {
    setQuery(q);
    setNoResults(false);

    if (q.length < 3) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      if (abortRef.current) abortRef.current.abort();
      abortRef.current = new AbortController();

      try {
        const data = await searchAddress(q, abortRef.current.signal);
        setResults(data);
        setNoResults(data.length === 0);
      } catch {
        // aborted
      }
      setLoading(false);
    }, 300);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  const startEdit = () => {
    let street = selected?.street || "";
    let houseNumber = selected?.house_number || "";
    let postcode = selected?.postcode || "";
    let city = selected?.city || "";

    if (!street && !postcode && selected?.display_name) {
      const dn = selected.display_name;
      const match = dn.match(/^(.+?)\s*,\s*(\d{4,5})\s+(.+)$/);
      if (match) {
        const streetPart = match[1].trim();
        postcode = match[2];
        city = match[3].trim();
        const numMatch = streetPart.match(/^(.+?)\s+(\d+\w*)$/);
        if (numMatch) {
          street = numMatch[1];
          houseNumber = numMatch[2];
        } else {
          street = streetPart;
        }
      } else {
        street = dn;
      }
    }

    setEditStreet(street);
    setEditNumber(houseNumber);
    setEditPostcode(postcode);
    setEditCity(city);
    setEditError("");
    setEditing(true);
  };

  const confirmEdit = async () => {
    if (!editStreet.trim() || !editPostcode.trim() || !editCity.trim()) {
      setEditError("Rue, code postal et ville sont requis");
      return;
    }
    setGeocoding(true);
    setEditError("");

    const result = await geocodeAddress(editStreet.trim(), editNumber.trim(), editPostcode.trim(), editCity.trim());
    setGeocoding(false);

    if (!result) {
      setEditError("Adresse introuvable. Vérifiez les informations.");
      return;
    }

    const displayName = editNumber.trim()
      ? `${editStreet.trim()} ${editNumber.trim()}, ${editPostcode.trim()} ${editCity.trim()}`
      : `${editStreet.trim()}, ${editPostcode.trim()} ${editCity.trim()}`;

    onSelect({
      display_name: displayName,
      lat: result.lat,
      lng: result.lng,
      street: editStreet.trim(),
      house_number: editNumber.trim(),
      postcode: editPostcode.trim(),
      city: editCity.trim(),
    });
    setEditing(false);
  };

  // Structured editing mode
  if (editing) {
    return (
      <div className="space-y-2">
        <p className="text-xs font-bold text-card-foreground">Modifier l'adresse</p>
        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-2">
            <input type="text" value={editStreet} onChange={(e) => setEditStreet(e.target.value)}
              placeholder="Rue" autoFocus
              className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary" />
          </div>
          <div>
            <input type="text" value={editNumber} onChange={(e) => setEditNumber(e.target.value)}
              placeholder="N°"
              className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary" />
          </div>
        </div>
        <div className="grid grid-cols-5 gap-2">
          <div className="col-span-2">
            <input type="text" value={editPostcode} onChange={(e) => setEditPostcode(e.target.value)}
              placeholder="Code postal"
              className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary" />
          </div>
          <div className="col-span-3">
            <input type="text" value={editCity} onChange={(e) => setEditCity(e.target.value)}
              placeholder="Ville"
              className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary" />
          </div>
        </div>
        {editError && <p className="text-xs text-destructive">{editError}</p>}
        <div className="flex gap-2">
          <button onClick={confirmEdit} disabled={geocoding}
            className="flex-1 rounded-lg bg-primary py-2.5 text-xs font-bold text-primary-foreground disabled:opacity-60">
            {geocoding ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Valider l'adresse"}
          </button>
          <button onClick={() => setEditing(false)}
            className="rounded-lg border px-4 py-2.5 text-xs font-semibold text-muted-foreground hover:bg-accent">
            Annuler
          </button>
        </div>
      </div>
    );
  }

  const handleClear = () => {
    setQuery("");
    setResults([]);
    setNoResults(false);
    setEditing(false);
    setEditError("");
    onClear();
  };

  // Selected address display
  if (selected) {
    const hasCoords = selected.lat !== 0 && selected.lng !== 0;
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2.5">
          <MapPin className="h-4 w-4 text-primary shrink-0" />
          <span className="text-sm text-foreground truncate flex-1">{selected.display_name}</span>
          <button onClick={startEdit} className="text-muted-foreground hover:text-primary" title="Modifier l'adresse">
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button onClick={handleClear} className="text-muted-foreground hover:text-destructive">
            <X className="h-4 w-4" />
          </button>
        </div>
        {hasCoords && (
          <div className="flex items-center gap-1 px-1">
            <CheckCircle2 className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
            <span className="text-[11px] text-emerald-700 dark:text-emerald-300 font-medium">Position GPS confirmée</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={query} onChange={(e) => handleSearch(e.target.value)}
            placeholder="Entrez votre adresse de livraison…" className="pl-9 pr-9" />
          {loading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
        <button type="button" onClick={handleGeolocate} disabled={locating}
          className="shrink-0 flex items-center justify-center h-10 w-10 rounded-lg border bg-background text-primary hover:bg-accent transition-colors"
          title="Utiliser ma position">
          {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />}
        </button>
      </div>

      {results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border bg-card shadow-elevated max-h-48 overflow-y-auto">
          {results.map((r, i) => (
            <button key={i} onClick={() => { onSelect(r); setQuery(""); setResults([]); setNoResults(false); }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors flex items-start gap-2">
              <MapPin className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
              <span>{r.display_name}</span>
            </button>
          ))}
        </div>
      )}

      {noResults && !loading && query.length >= 3 && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border bg-card shadow-elevated px-3 py-3">
          <p className="text-sm text-muted-foreground text-center">Aucune adresse trouvée</p>
        </div>
      )}
    </div>
  );
};

export default DeliveryAddressInput;