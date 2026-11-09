import { Plus } from "lucide-react";
import { OptimizedImage } from "@/components/ui/optimized-image";

interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number;
  image_url?: string | null;
  is_available: boolean;
  menu_supplement?: number | null;
  menu_label?: string | null;
}

interface Props {
  product: Product;
  isClosed: boolean;
  onAdd: (product: Product) => void;
}

const ProductCard = ({ product, isClosed, onAdd }: Props) => {
  const disabled = !product.is_available || isClosed;

  return (
    <div
      className={`flex items-center gap-3 border-b border-border py-4 ${
        disabled ? "opacity-40" : ""
      }`}
    >
      {/* Info */}
      <div className="flex flex-1 flex-col gap-1">
        <h3 className="text-sm font-bold text-foreground leading-tight">{product.name}</h3>
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-semibold text-foreground">
            {Number(product.price).toFixed(2)} €
          </p>
          {product.menu_supplement != null && (
            <span className="rounded bg-accent px-1 py-0.5 text-[9px] font-bold text-accent-foreground">
              Menu {(Number(product.price) + Number(product.menu_supplement)).toFixed(2)}€
            </span>
          )}
        </div>
        {product.description && (
          <p className="line-clamp-2 text-xs text-muted-foreground">{product.description}</p>
        )}
      </div>

      {/* Image (only if available) */}
      {product.image_url && (
        <div className="relative flex-shrink-0">
          <div className="relative flex h-[70px] w-[70px] items-center justify-center overflow-hidden rounded-xl">
            <OptimizedImage
              src={product.image_url}
              alt={product.name}
              width={140}
              quality={70}
              containerClassName="h-full w-full rounded-xl"
            />
          </div>
          {!disabled ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAdd(product);
              }}
              className="absolute -bottom-2 -right-2 flex h-7 w-7 items-center justify-center rounded-full border-2 border-card bg-primary text-primary-foreground shadow-card transition-all active:scale-90"
            >
              <Plus className="h-4 w-4" strokeWidth={2.5} />
            </button>
          ) : (
            <span className="absolute -bottom-1 right-0 text-[9px] font-medium text-muted-foreground">
              {isClosed ? "Fermé" : "Indispo."}
            </span>
          )}
        </div>
      )}

      {/* Add button when no image */}
      {!product.image_url && !disabled && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onAdd(product);
          }}
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-card transition-all active:scale-90"
        >
          <Plus className="h-4 w-4" strokeWidth={2.5} />
        </button>
      )}
      {!product.image_url && disabled && (
        <span className="flex-shrink-0 text-[9px] font-medium text-muted-foreground">
          {isClosed ? "Fermé" : "Indispo."}
        </span>
      )}
    </div>
  );
};

export default ProductCard;
