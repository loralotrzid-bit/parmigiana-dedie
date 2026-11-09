import { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { Home, ShoppingBag, ClipboardList, UserCircle } from "lucide-react";
import AddressButton from "@/components/client/AddressButton";

const navItems = [
  { path: "/home", icon: Home, label: "Menu" },
  { path: "/cart", icon: ShoppingBag, label: "Panier" },
  { path: "/orders", icon: ClipboardList, label: "Suivi" },
];

const ClientLayout = ({ children }: { children: ReactNode }) => {
  const { pathname } = useLocation();

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b bg-card/80 backdrop-blur-lg">
        <div className="flex h-14 items-center justify-between px-4">
          <Link to="/home" className="flex items-center gap-2">
            <span className="text-xl font-extrabold text-primary">La</span>
            <span className="text-xl font-bold text-foreground">Parmigiana</span>
          </Link>
          <div className="flex items-center gap-2">
            <AddressButton compact />
            <Link to="/account" className="flex h-9 w-9 items-center justify-center rounded-full border bg-secondary/50 text-foreground hover:bg-secondary transition-colors">
              <UserCircle className="h-5 w-5" />
            </Link>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 pb-20">{children}</main>

      {/* Bottom navigation */}
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

export default ClientLayout;
