import { ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Bell, LayoutDashboard, UtensilsCrossed, Truck, Settings, LogOut, Bike, Store } from "lucide-react";
import { useAuth } from "@/contexts/useAuth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const navItems = [
  { path: "/admin/service", icon: Bell, label: "Salle" },
  { path: "/admin", icon: LayoutDashboard, label: "Commandes" },
  { path: "/admin/menu", icon: UtensilsCrossed, label: "Menu" },
  { path: "/admin/drivers", icon: Truck, label: "Livreurs" },
  { path: "/admin/settings", icon: Settings, label: "Réglages" },
];

const AdminLayout = ({ children }: { children: ReactNode }) => {
  const { pathname } = useLocation();
  const { signOut, restaurantId } = useAuth();
  const navigate = useNavigate();

  const { data: restaurantSlug } = useQuery({
    queryKey: ["restaurant-slug", restaurantId],
    queryFn: async () => {
      const { data } = await supabase.from("restaurants").select("slug").eq("id", restaurantId!).single();
      return data?.slug ?? null;
    },
    enabled: !!restaurantId,
  });

  const handleLogout = async () => {
    await signOut();
    navigate("/admin/login");
  };

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <header className="sticky top-0 z-40 border-b bg-card/80 backdrop-blur-lg">
        <div className="flex items-center gap-2 overflow-x-auto px-4 py-2 scrollbar-hide">
          <Link to="/admin" className="flex items-center gap-2 shrink-0">
            <span className="text-xl font-extrabold text-primary">Parmigiana</span>
            <span className="text-lg font-bold text-foreground">Admin</span>
          </Link>
          <div className="flex items-center gap-2 ml-auto shrink-0">

              <Link
                to="/admin/caisse"
                className="flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-xs font-bold text-accent-foreground hover:bg-accent/80 transition-colors whitespace-nowrap"
              >
                <Store className="h-3.5 w-3.5" />
                Caisse
              </Link>
            {restaurantSlug && (
              <Link
                to={`/delivery?restaurant=${restaurantSlug}`}
                className="flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary hover:bg-primary/20 transition-colors whitespace-nowrap"
              >
                <Bike className="h-3.5 w-3.5" />
                Livraison
              </Link>
            )}
            <span className="rounded-full bg-success/10 px-3 py-1 text-xs font-semibold text-success whitespace-nowrap">
              En ligne
            </span>
            <button
              onClick={handleLogout}
              className="text-muted-foreground hover:text-foreground shrink-0"
              title="Déconnexion"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 pb-20">{children}</main>

      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t bg-card/95 backdrop-blur-lg">
        <div className="mx-auto flex max-w-lg items-center justify-around py-2">
          {navItems.map(({ path, icon: Icon, label }) => {
            const isActive = pathname === path;
            return (
              <Link
                key={path}
                to={path}
                className={`flex flex-col items-center gap-0.5 px-3 py-1 text-xs font-medium transition-colors ${
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-5 w-5" />
                <span>{label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
};

export default AdminLayout;
