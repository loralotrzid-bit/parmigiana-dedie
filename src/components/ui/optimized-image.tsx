/**
 * OptimizedImage — progressive image with:
 * - Tiny colored placeholder (no CLS)
 * - IntersectionObserver lazy-load (only loads when near viewport)
 * - Fade-in transition on load
 * - Optional Supabase Storage WebP transform
 */

import { useState, useRef, useEffect, memo } from "react";
import { cn } from "@/lib/utils";
import { optimizedUrl } from "@/hooks/useImagePrefetch";

interface OptimizedImageProps {
  src: string | null | undefined;
  alt: string;
  width?: number;
  quality?: number;
  className?: string;
  containerClassName?: string;
  /** Eagerly load (above-the-fold). Default: lazy */
  eager?: boolean;
  /** Fallback content when no src */
  fallback?: React.ReactNode;
}

const OptimizedImage = memo(function OptimizedImage({
  src,
  alt,
  width = 400,
  quality = 75,
  className,
  containerClassName,
  eager = false,
  fallback,
}: OptimizedImageProps) {
  const [loaded, setLoaded] = useState(false);
  const [inView, setInView] = useState(eager);
  const ref = useRef<HTMLDivElement>(null);

  // IntersectionObserver for lazy images
  useEffect(() => {
    if (eager || !ref.current) return;
    const el = ref.current;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          obs.disconnect();
        }
      },
      { rootMargin: "200px" }, // start loading 200px before viewport
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [eager]);

  const finalSrc = optimizedUrl(src, width, quality);

  if (!src) {
    return fallback ? <>{fallback}</> : null;
  }

  return (
    <div ref={ref} className={cn("overflow-hidden bg-muted", containerClassName)} style={{ contentVisibility: "auto" }}>
      {/* Skeleton pulse while loading */}
      {!loaded && <div className="absolute inset-0 animate-pulse bg-muted" />}

      {inView && (
        <img
          src={finalSrc}
          alt={alt}
          decoding="async"
          onLoad={() => setLoaded(true)}
          className={cn(
            "h-full w-full object-cover transition-opacity duration-200",
            loaded ? "opacity-100" : "opacity-0",
            className,
          )}
        />
      )}
    </div>
  );
});

export { OptimizedImage };
