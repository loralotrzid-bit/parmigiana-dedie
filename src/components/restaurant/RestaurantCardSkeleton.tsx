import { Skeleton } from "@/components/ui/skeleton";

const RestaurantCardSkeleton = () => (
  <div className="rounded-xl border bg-card overflow-hidden shadow-card">
    <Skeleton className="h-36 w-full rounded-none" />
    <div className="p-3 space-y-2">
      <Skeleton className="h-4 w-2/3" />
      <div className="flex items-center gap-3">
        <Skeleton className="h-3 w-12" />
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-24" />
      </div>
    </div>
  </div>
);

export const RestaurantListSkeleton = ({ count = 4 }: { count?: number }) => (
  <div className="space-y-3 pb-4">
    {Array.from({ length: count }).map((_, i) => (
      <RestaurantCardSkeleton key={i} />
    ))}
  </div>
);

export default RestaurantCardSkeleton;
