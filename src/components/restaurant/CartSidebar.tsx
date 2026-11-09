import { ShoppingBag } from "lucide-react";
import { Link } from "react-router-dom";
import { useCart } from "@/contexts/useCart";

const CartSidebar = () => {
  const { items, total, itemCount } = useCart();

  return (
    <div className="sticky top-20 rounded-xl border border-border bg-card p-5 shadow-card">
      {itemCount === 0 ? (
        <div className="flex flex-col items-center py-8 text-center">
          <ShoppingBag className="mb-3 h-10 w-10 text-muted-foreground/30" />
          <p className="text-sm font-bold text-foreground">Remplissez votre panier</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Ajoutez de la nourriture savoureuse au menu et commandez.
          </p>
        </div>
      ) : (
        <>
          <h3 className="text-sm font-bold text-foreground">
            Panier ({itemCount})
          </h3>
          <div className="mt-3 space-y-2">
            {items.slice(0, 5).map((item) => (
              <div key={item.id} className="flex items-center justify-between text-xs">
                <span className="text-foreground">
                  {item.quantity}× {item.product_name}
                </span>
                <span className="font-semibold text-foreground">
                  {(item.unit_price * item.quantity).toFixed(2)} €
                </span>
              </div>
            ))}
            {items.length > 5 && (
              <p className="text-xs text-muted-foreground">+{items.length - 5} autres articles</p>
            )}
          </div>
          <div className="mt-3 border-t border-border pt-3">
            <div className="flex items-center justify-between text-sm font-bold">
              <span>Total</span>
              <span className="text-primary">{total.toFixed(2)} €</span>
            </div>
          </div>
          <Link
            to="/cart"
            className="mt-3 block w-full rounded-lg bg-primary py-2.5 text-center text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Voir le panier
          </Link>
        </>
      )}
    </div>
  );
};

export default CartSidebar;
