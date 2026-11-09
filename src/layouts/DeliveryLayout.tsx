import { ReactNode, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Package, Navigation, LogOut, ArrowLeft, Utensils } from "lucide-react";

interface DeliveryLayoutProps {
  children: ReactNode;
  driverCode?: string | null;
  onLogout?: () => void;
  canDeliver?: boolean;
  canServe?: boolean;
  embedded?: boolean;
}

const DeliveryLayout = ({ children, driverCode, onLogout, canDeliver = false, canServe = false, embedded = false }: DeliveryLayoutProps) => {
  const { pathname } = useLocation();
  const navItems = [
    ...(canDeliver ? [{ path: "/delivery", icon: Package, label: "Commandes" }, { path: "/delivery/active", icon: Navigation, label: "Courses" }] : []),
    ...(canServe ? [{ path: "/delivery/service", icon: Utensils, label: "Salle & caisse" }] : []),
  ];

  if (embedded) return <>{children}</>;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <header className="sticky top-0 z-40 border-b bg-card/80 backdrop-blur-lg">
        <div className="flex h-14 items-center justify-between px-4">
          <Link to="/delivery" className="flex items-center gap-2">
            <span className="text-xl font-extrabold text-primary">RZ</span>
            <span className="text-lg font-bold text-foreground">Personnel</span>
          </Link>
          <div className="flex items-center gap-2">
            {driverCode && (
              <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                {driverCode}
              </span>
            )}
            {onLogout && (
              <div className="flex items-center gap-2">
                <Link to="/admin" className="text-muted-foreground hover:text-foreground" title="Retour admin">
                  <ArrowLeft className="h-4 w-4" />
                </Link>
                <button onClick={onLogout} className="text-muted-foreground hover:text-foreground" title="Déconnexion">
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            )}
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
                className={`flex flex-col items-center gap-0.5 px-4 py-1 text-xs font-medium transition-colors ${
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

export default DeliveryLayout;
