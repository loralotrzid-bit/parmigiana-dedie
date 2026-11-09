import { Star, Clock, Bike, Leaf, AlertTriangle } from "lucide-react";

interface Props {
  name: string;
  description?: string | null;
  rating?: number | null;
  avgPrepTime?: number | null;
  avgDeliveryTime?: number | null;
  deliveryFee?: number;
  isFreeDelivery?: boolean | null;
  halalType: string;
  isClosed: boolean;
  orderType?: string;
}

const halalBadge = (type: string) => {
  if (type === "yes")
    return (
      <span className="flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-semibold text-success">
        <Leaf className="h-3 w-3" /> 100% Halal
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

const RestaurantInfo = ({
  name,
  description,
  rating,
  avgPrepTime,
  avgDeliveryTime,
  deliveryFee,
  isFreeDelivery,
  halalType,
  isClosed,
  orderType,
}: Props) => {
  const displayTime = orderType === "delivery" && avgDeliveryTime != null ? avgDeliveryTime : avgPrepTime;
  const timeLabel = orderType === "delivery" ? "livraison" : "prépa";

  return (
  <div className="px-5 pb-4 pt-10">
    {/* Title row */}
    <div className="flex items-start justify-between gap-3">
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-extrabold text-foreground">{name}</h1>
          {halalBadge(halalType)}
        </div>
        {description && (
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
    </div>

    {/* Stats badges */}
    <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
      {rating != null && (
        <span className="flex items-center gap-1 font-semibold">
          <Star className="h-3.5 w-3.5 fill-warning text-warning" />
          <span className="text-foreground">{rating.toFixed(1)}</span>
        </span>
      )}
      {displayTime != null && (
        <span className="flex items-center gap-1">
          <Clock className="h-3.5 w-3.5" />
          {displayTime} min {timeLabel}
        </span>
      )}
      <span className="flex items-center gap-1">
        <Bike className="h-3.5 w-3.5" />
        {isFreeDelivery ? "Gratuit" : deliveryFee != null ? `${deliveryFee.toFixed(2)} €` : "—"}
      </span>
    </div>

    {/* Closed banner */}
    {isClosed && (
      <div className="mt-3 flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2.5 text-xs font-medium text-destructive">
        <AlertTriangle className="h-4 w-4 flex-shrink-0" />
        Ce restaurant est actuellement fermé.
      </div>
    )}
  </div>
  );
};

export default RestaurantInfo;
