import { useQuery } from "@tanstack/react-query";
import { fetchMenuByRestaurantId } from "@/services/menuService";
import { Plus } from "lucide-react";
import { useCart } from "@/contexts/useCart";
import type { Tables } from "@/integrations/supabase/types";

interface Props {
  restaurantId: string;
}

const DRINK_KEYWORDS = ["boisson", "drink", "coca", "fanta", "eau", "jus", "smoothie", "pepsi", "sprite", "limonade", "thé", "café", "ice tea", "orangina", "7up", "redbull", "bière", "soda"];
const DESSERT_KEYWORDS = ["dessert", "tiramisu", "glace", "brownie", "cookie", "gâteau", "fondant", "mousse", "crème", "tarte", "muffin", "donut", "pancake", "churros"];
const OTHER_KEYWORDS = ["frites", "supplement", "sauce"];

const getCategory = (product: Tables<"products">): "drink" | "dessert" | "other" | "none" => {
  const text = (product.name + " " + (product.description || "")).toLowerCase();
  if (DRINK_KEYWORDS.some((kw) => text.includes(kw))) return "drink";
  if (DESSERT_KEYWORDS.some((kw) => text.includes(kw))) return "dessert";
  if (OTHER_KEYWORDS.some((kw) => text.includes(kw)) || product.is_featured) return "other";
  return "none";
};

const PRIORITY: Record<string, number> = { drink: 0, dessert: 1, other: 2 };

const CartSuggestions = ({ restaurantId }: Props) => {
  const { items, addItem } = useCart();

  const { data: categories } = useQuery({
    queryKey: ["menu", restaurantId],
    queryFn: () => fetchMenuByRestaurantId(restaurantId),
    enabled: !!restaurantId,
    staleTime: 60_000,
  });

  if (!categories) return null;

  const cartProductIds = new Set(items.map((i) => i.product_id));
  const allProducts = categories.flatMap((c) => c.products);

  const suggestions = allProducts
    .filter((p) => !cartProductIds.has(p.id) && p.is_available && p.is_published)
    .map((p) => ({ ...p, _cat: getCategory(p) }))
    .filter((p) => p._cat !== "none")
    .sort((a, b) => PRIORITY[a._cat] - PRIORITY[b._cat])
    .slice(0, 6);

  if (suggestions.length === 0) return null;

  return (
    <div className="mt-4 rounded-xl border bg-card p-4 shadow-card">
      <h3 className="mb-3 text-sm font-bold text-card-foreground">Avez-vous vu...</h3>
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        {suggestions.map((product) => (
          <button
            key={product.id}
            onClick={() =>
              addItem({
                restaurant_id: restaurantId,
                product_id: product.id,
                product_name: product.name,
                options: [],
                unit_price: Number(product.price),
                quantity: 1,
              })
            }
            className="flex-shrink-0 w-28 rounded-lg border bg-background p-2 text-left hover:border-primary/40 transition-colors"
          >
            {product.image_url ? (
              <img src={product.image_url} alt="" loading="lazy" decoding="async" className="h-16 w-full rounded object-cover mb-1" />
            ) : (
              <div className="h-16 w-full rounded bg-muted flex items-center justify-center text-lg mb-1">
                {product._cat === "drink" ? "🥤" : product._cat === "dessert" ? "🍰" : "🍽️"}
              </div>
            )}
            <p className="text-[11px] font-semibold text-foreground truncate">{product.name}</p>
            <div className="flex items-center justify-between mt-0.5">
              <span className="text-[11px] font-bold text-primary">{Number(product.price).toFixed(2)} €</span>
              <Plus className="h-3.5 w-3.5 text-primary" />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default CartSuggestions;
