import { memo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { MapPin, Star, Clock, Leaf } from "lucide-react";
import { fetchRestaurantBySlug } from "@/services/restaurantService";
import { fetchMenuByRestaurantId } from "@/services/menuService";
import { OptimizedImage } from "@/components/ui/optimized-image";
import { prefetchImage, optimizedUrl } from "@/hooks/useImagePrefetch";

interface RestaurantCardProps {
  id: string;
  slug: string;
  name: string;
  image_url?: string | null;
  logo_url?: string | null;
  is_open: boolean;
  halal_type: string;
  rating?: number | null;
  avg_prep_time?: number | null;
  avg_delivery_time?: number | null;
  delivery_mode?: string | null;
  address?: string | null;
}

const HalalBadge = ({ type }: { type: string }) => {
  if (type === "yes")
    return (
      <span className="flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-semibold text-success">
        <Leaf className="h-3 w-3" /> Halal
      </span>
    );
  if (type === "mixed")
    return (
      <span className="flex items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 text-[11px] font-semibold text-warning">
        <Leaf className="h-3 w-3" /> Mixte
      </span>
    );
  return null;
};

const RestaurantCard = memo(function RestaurantCard({
  id,
  slug,
  name,
  image_url,
  logo_url,
  is_open,
  halal_type,
  rating,
  avg_prep_time,
  avg_delivery_time,
  delivery_mode,
  address,
}: RestaurantCardProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const prefetch = useCallback(() => {
    // Prefetch data
    queryClient.prefetchQuery({
      queryKey: ["restaurant", slug],
      queryFn: () => fetchRestaurantBySlug(slug),
      staleTime: 120_000,
    });
    queryClient.prefetchQuery({
      queryKey: ["menu", id],
      queryFn: () => fetchMenuByRestaurantId(id),
      staleTime: 120_000,
    });
    // Prefetch hero image at full size so restaurant page is instant
    if (image_url) prefetchImage(optimizedUrl(image_url, 800, 80));
    if (logo_url) prefetchImage(optimizedUrl(logo_url, 112, 80));
  }, [slug, id, queryClient, image_url, logo_url]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    prefetch();
    navigate(`/restaurant/${slug}`);
  }, [slug, navigate, prefetch]);

  return (
    <a
      href={`/restaurant/${slug}`}
      onClick={handleClick}
      onMouseEnter={prefetch}
      onTouchStart={prefetch}
      className="block rounded-xl border bg-card overflow-hidden shadow-card transition-shadow hover:shadow-elevated active:scale-[0.995]"
    >
      <div className="h-36 w-full relative overflow-hidden">
        <OptimizedImage
          src={image_url}
          alt={name}
          width={400}
          quality={70}
          containerClassName="h-full w-full"
          fallback={
            <div className="h-full w-full bg-muted flex items-center justify-center text-4xl text-muted-foreground/30 font-bold">
              {name.charAt(0)}
            </div>
          }
        />
        <div className="absolute bottom-2 left-3 h-10 w-10 rounded-full bg-card border shadow-sm flex items-center justify-center overflow-hidden">
          <OptimizedImage
            src={logo_url}
            alt=""
            width={80}
            quality={80}
            eager
            containerClassName="h-full w-full"
            fallback={<span className="text-sm font-bold text-primary">{name.charAt(0)}</span>}
          />
        </div>
        {!is_open && (
          <div className="absolute top-2 right-2 rounded-full bg-destructive/90 px-2.5 py-0.5 text-[11px] font-semibold text-destructive-foreground">
            Fermé
          </div>
        )}
      </div>
      <div className="p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <h3 className="text-sm font-bold text-card-foreground">{name}</h3>
          <HalalBadge type={halal_type} />
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-0.5">
            <Star className="h-3.5 w-3.5 fill-warning text-warning" />
            {rating}
          </span>
          <span className="flex items-center gap-0.5">
            <Clock className="h-3.5 w-3.5" />
            {avg_prep_time} min
          </span>
          {avg_delivery_time != null && delivery_mode && delivery_mode !== "disabled" && (
            <span className="flex items-center gap-0.5 text-primary font-semibold">
              🚴 {avg_delivery_time} min
            </span>
          )}
          {address && (
            <span className="flex items-center gap-0.5">
              <MapPin className="h-3.5 w-3.5" />
              <span className="truncate max-w-[140px]">{address}</span>
            </span>
          )}
        </div>
      </div>
    </a>
  );
});

export default RestaurantCard;
