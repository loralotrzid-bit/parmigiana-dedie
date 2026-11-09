import { ArrowLeft, ShoppingBag, ImageIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { OptimizedImage } from "@/components/ui/optimized-image";

interface Props {
  restaurantName: string;
  imageUrl?: string | null;
  logoUrl?: string | null;
  itemCount: number;
}

const RestaurantHero = ({ restaurantName, imageUrl, logoUrl, itemCount }: Props) => (
  <div className="relative">
    {/* Hero banner */}
    <div className="relative h-36 sm:h-44 md:h-52 w-full overflow-hidden">
      <OptimizedImage
        src={imageUrl}
        alt={restaurantName}
        width={800}
        quality={80}
        eager
        containerClassName="h-full w-full"
        fallback={
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-muted to-secondary">
            <ImageIcon className="h-12 w-12 text-muted-foreground/30" />
          </div>
        }
      />
      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-foreground/30 to-transparent" />
    </div>

    {/* Floating back button */}
    <Link
      to="/"
      className="absolute left-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-card/80 text-foreground shadow-elevated backdrop-blur-md transition-transform active:scale-90"
    >
      <ArrowLeft className="h-4 w-4" />
    </Link>

    {/* Floating cart badge */}
    {itemCount > 0 && (
      <Link
        to="/cart"
        className="absolute right-4 top-4 flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground shadow-elevated backdrop-blur-md"
      >
        <ShoppingBag className="h-4 w-4" />
        <span>{itemCount}</span>
      </Link>
    )}

    {/* Floating logo */}
    <div className="absolute -bottom-7 left-5 flex h-14 w-14 items-center justify-center rounded-xl border-2 border-card bg-card shadow-elevated overflow-hidden">
      <OptimizedImage
        src={logoUrl}
        alt={restaurantName}
        width={112}
        quality={80}
        eager
        containerClassName="h-full w-full"
        fallback={
          <span className="text-lg font-extrabold text-primary">
            {restaurantName.charAt(0)}
          </span>
        }
      />
    </div>
  </div>
);

export default RestaurantHero;
