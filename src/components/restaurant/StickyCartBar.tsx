import { ShoppingBag } from "lucide-react";
import { useCart } from "@/contexts/useCart";
import { Link } from "react-router-dom";

const StickyCartBar = () => {
  const { itemCount, total } = useCart();

  if (itemCount === 0) return null;

  return (
    <div className="fixed bottom-14 left-0 right-0 z-50 px-4 pb-2 pt-3 bg-background lg:hidden">
      <Link
        to="/cart"
        className="flex items-center justify-between rounded-full bg-primary px-5 py-3.5 shadow-float transition-transform active:scale-[0.98]"
      >
        <div className="flex items-center gap-2">
          <div className="relative">
            <ShoppingBag className="h-5 w-5 text-primary-foreground" />
            <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-card text-[10px] font-bold text-foreground">
              {itemCount}
            </span>
          </div>
          <span className="text-sm font-bold text-primary-foreground">
            Afficher le panier
          </span>
        </div>
        <span className="text-sm font-bold text-primary-foreground">
          {total.toFixed(2)} €
        </span>
      </Link>
    </div>
  );
};

export default StickyCartBar;
