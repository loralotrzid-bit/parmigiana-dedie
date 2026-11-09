import { MapPin, Search, UtensilsCrossed, Truck, Clock, LocateFixed, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { searchAddress, reverseGeocode } from "@/lib/geo";
// geolocation utilities used only in useDriverGps now
import { setSavedAddress } from "@/lib/savedAddress";
import heroImage from "@/assets/landing-hero.jpg";
import { safeToast } from "@/lib/safeToast";

interface AddressSuggestion {
  display_name: string;
  lat: number;
  lng: number;
}

const Landing = () => {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    // Guard: if OAuth tokens are present in the URL, redirect to callback handler
    const hash = window.location.hash || "";
    const search = window.location.search || "";
    if (hash.includes("access_token=") || hash.includes("code=") || new URLSearchParams(search).has("code")) {
      window.location.replace("/auth/callback" + search + hash);
      return;
    }

    const hasVisited = localStorage.getItem("rzfood_visited");
    if (hasVisited) {
      navigate("/home", { replace: true });
    } else {
      localStorage.setItem("rzfood_visited", "1");
    }
  }, [navigate]);

  /**
   * Geolocation — called DIRECTLY from button click (user gesture).
   * checkGeoPermission is non-blocking and won't break the gesture chain on most browsers.
   * The actual getCurrentPosition call happens synchronously within the click context.
   */
  const handleGeolocate = () => {
    if (!navigator.geolocation) {
      safeToast.error("La géolocalisation n'est pas supportée par votre navigateur.");
      return;
    }

    setLocating(true);
    // CRITICAL: No await before this call — must stay in user gesture context for Safari/iOS
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const result = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
        setLocating(false);
        if (result) {
          setSavedAddress(result);
          navigate("/home");
        } else {
          safeToast.error("Impossible de trouver votre adresse. Essayez de la saisir manuellement.");
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

  const handleSearch = async (q: string) => {
    setQuery(q);
    if (q.length >= 3) {
      setSearching(true);
      const results = await searchAddress(q);
      setSuggestions(results);
      setSearching(false);
    } else {
      setSuggestions([]);
    }
  };

  const handleSelect = (s: AddressSuggestion) => {
    setSavedAddress({ display_name: s.display_name, lat: s.lat, lng: s.lng });
    navigate("/home");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (suggestions.length > 0) {
      handleSelect(suggestions[0]);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 sm:px-8">
        <h2 className="text-xl font-extrabold text-primary tracking-tight">RZ Food</h2>
        <a href="/admin/login" className="text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors">
          Espace pro
        </a>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="flex flex-col lg:flex-row">
          <div className="flex-1 flex flex-col justify-center px-6 py-12 sm:px-12 lg:px-16 lg:py-24">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-foreground leading-tight">
              Commandez vos<br />
              <span className="text-primary">repas préférés</span>
            </h1>
            <p className="mt-3 text-base sm:text-lg text-muted-foreground max-w-md">
              Restaurants et commerces qui livrent près de chez vous
            </p>

            <form onSubmit={handleSubmit} className="relative mt-8 max-w-lg">
              <div className="flex items-center rounded-2xl border-2 border-border bg-card shadow-card focus-within:border-primary transition-colors">
                <MapPin className="ml-4 h-5 w-5 text-muted-foreground shrink-0" />
                <input type="text" value={query} onChange={(e) => handleSearch(e.target.value)}
                  placeholder="Adresse complète"
                  className="flex-1 bg-transparent px-3 py-4 text-sm text-foreground placeholder:text-muted-foreground outline-none" />
                <button type="submit"
                  className="mr-1.5 shrink-0 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90 transition-colors">
                  Rechercher
                </button>
              </div>

              {suggestions.length > 0 && (
                <div className="absolute z-50 mt-1.5 w-full rounded-xl border bg-card shadow-elevated max-h-56 overflow-y-auto">
                  {suggestions.map((s, i) => (
                    <button key={i} type="button" onClick={() => handleSelect(s)}
                      className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-accent transition-colors border-b last:border-0">
                      <MapPin className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                      <span className="text-sm text-foreground">{s.display_name}</span>
                    </button>
                  ))}
                </div>
              )}

              {searching && (
                <div className="absolute z-50 mt-1.5 w-full rounded-xl border bg-card shadow-elevated px-4 py-3">
                  <p className="text-sm text-muted-foreground animate-pulse">Recherche en cours…</p>
                </div>
              )}
            </form>

            <div className="mt-4 flex items-center gap-4">
              <button onClick={handleGeolocate} disabled={locating}
                className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80 transition-colors">
                {locating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LocateFixed className="h-3.5 w-3.5" />}
                Utiliser ma position
              </button>
              <button onClick={() => navigate("/home")}
                className="text-xs font-semibold text-muted-foreground hover:text-primary transition-colors">
                Parcourir sans adresse →
              </button>
            </div>
          </div>

          <div className="hidden lg:block flex-1 relative">
            <div className="absolute inset-0 bg-primary/90" />
            <img src={heroImage} alt="Délicieux repas livrés chez vous"
              className="relative h-full w-full object-cover mix-blend-multiply opacity-80" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center text-primary-foreground">
                <p className="text-5xl font-extrabold leading-tight drop-shadow-lg">LIVRÉ<br />CHEZ VOUS</p>
              </div>
            </div>
          </div>

          <div className="lg:hidden h-48 relative bg-primary overflow-hidden">
            <img src={heroImage} alt="" className="h-full w-full object-cover mix-blend-multiply opacity-70" />
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-3xl font-extrabold text-primary-foreground drop-shadow-lg">LIVRÉ CHEZ VOUS</p>
            </div>
          </div>
        </div>
      </section>

      <section className="px-6 py-12 sm:px-12 lg:py-16">
        <p className="text-center text-sm text-muted-foreground">Comment ça marche ?</p>
        <h2 className="text-center text-xl sm:text-2xl font-extrabold text-primary mt-1">C'est très simple !</h2>
        <div className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-8 max-w-3xl mx-auto">
          <Step icon={<MapPin className="h-8 w-8" />} title="Indiquez où vous êtes" desc="Nous affichons les restaurants qui livrent chez vous" />
          <Step icon={<UtensilsCrossed className="h-8 w-8" />} title="Choisissez vos plats" desc="Parcourez les menus et ajoutez au panier" />
          <Step icon={<Truck className="h-8 w-8" />} title="Livraison ou à emporter" desc="Suivez votre commande en temps réel" />
        </div>
      </section>

      <footer className="border-t py-6 text-center text-[10px] text-muted-foreground/60 space-y-1">
        <div className="flex items-center justify-center gap-3">
          <a href="/legal" className="hover:text-muted-foreground transition-colors">Mentions légales</a>
          <span>·</span>
          <a href="/support" className="hover:text-muted-foreground transition-colors">Support</a>
          <span>·</span>
          <a href="/legal" className="hover:text-muted-foreground transition-colors">RGPD</a>
        </div>
        <p>© {new Date().getFullYear()} RZFood — Radoine Chajai — Tous droits réservés</p>
      </footer>
    </div>
  );
};

const Step = ({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) => (
  <div className="flex flex-col items-center text-center">
    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary mb-4">{icon}</div>
    <h3 className="text-sm font-bold text-foreground">{title}</h3>
    <p className="mt-1 text-xs text-muted-foreground max-w-[200px]">{desc}</p>
  </div>
);

export default Landing;
