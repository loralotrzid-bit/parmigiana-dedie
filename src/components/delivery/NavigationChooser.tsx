import { Navigation, MapPin } from "lucide-react";
import { useState, useEffect } from "react";

const NAV_APPS = [
  { id: "google", name: "Google Maps", urlFn: (addr: string) => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addr)}` },
  { id: "waze", name: "Waze", urlFn: (addr: string) => `https://waze.com/ul?q=${encodeURIComponent(addr)}&navigate=yes` },
  { id: "apple", name: "Plans", urlFn: (addr: string) => `https://maps.apple.com/?daddr=${encodeURIComponent(addr)}` },
];

const STORAGE_KEY = "rz_preferred_nav";

interface NavigationChooserProps {
  address: string;
  /** Compact = just an icon button that opens preferred app directly */
  compact?: boolean;
}

const NavigationChooser = ({ address, compact }: NavigationChooserProps) => {
  const [preferred, setPreferred] = useState<string | null>(null);

  useEffect(() => {
    setPreferred(localStorage.getItem(STORAGE_KEY));
  }, []);

  const selectApp = (id: string) => {
    localStorage.setItem(STORAGE_KEY, id);
    setPreferred(id);
    const app = NAV_APPS.find((a) => a.id === id);
    if (app) window.open(app.urlFn(address), "_blank");
  };

  const openPreferred = () => {
    const app = NAV_APPS.find((a) => a.id === preferred);
    if (app) window.open(app.urlFn(address), "_blank");
  };

  if (!address) return null;

  // Compact mode: single button if preference set, otherwise show all 3
  if (compact) {
    if (preferred) {
      const app = NAV_APPS.find((a) => a.id === preferred);
      return (
        <button
          onClick={openPreferred}
          className="flex items-center gap-1.5 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/10 transition-colors"
          title={`Naviguer avec ${app?.name}`}
        >
          <Navigation className="h-3.5 w-3.5" />
          {app?.name}
        </button>
      );
    }
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {NAV_APPS.map((app) => (
        <button
          key={app.id}
          onClick={() => selectApp(app.id)}
          className={`flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
            preferred === app.id
              ? "border-primary bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:bg-accent hover:text-foreground"
          }`}
        >
          <Navigation className="h-3 w-3" />
          {app.name}
        </button>
      ))}
    </div>
  );
};

export default NavigationChooser;
